// The loader's part for local integrations (design HAL-958, section 5). Every
// local integration runs in the runner, generated or hand-written, because
// Halonic can't tell who wrote it. Its code never loads on Halonic's side:
// the kit checks the sheet and builds the host without it, the runner starts,
// and what the code declares is checked against the sheet before any tool is
// offered. Built-in integrations keep loading in-process with `loadIntegration`.
//
// Whether a runner may start at all is the caller's: `start` goes through the
// trust check (a `TrustGrant` that covers the integration) and then the start
// gate in `core/app`, which picks the fenced sandbox or, on the path the user
// confirmed, the launcher's. This file never starts a process itself.

import {
  declarationProblems,
  type LoadedIntegration,
  type LoadProblem,
  type PreparedIntegration,
  type PrepareIntegrationOptions,
  prepareIntegration,
  type SecretForms,
  secretForms,
} from "@halonicjs/adapter-integration-kit";
import type {
  IntegrationConnection,
  IntegrationHost,
  IntegrationHttpClient,
} from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import type { RunnerConnection } from "./connect-runner.ts";
import { folderLinkProblems, type IntegrationFolderDisk } from "./integration-folder.ts";
import { RunnerStoppedError } from "./limits.ts";

/** What one runner start needs from the loader: the parts of the bridge only Halonic holds. */
export interface LocalRunnerBridge {
  /** The kit's client for this integration, from its host. */
  readonly http: IntegrationHttpClient;
  /** The user's plain settings for it. Never a secret. */
  readonly settings: Readonly<Record<string, unknown>>;
  /** The names of the tools its sheet declares. Only these are called. */
  readonly tools: readonly string[];
  /** Every form of its secrets' values, read for this start, for the bridge's filter. */
  readonly secrets: SecretForms;
}

/**
 * Starts one runner for the integration with `bridge`: the trust check, then
 * the start gate, then `startRunner`. It throws when nothing started, such as
 * an untrusted workspace or a fence that failed, and the loader passes that on.
 */
export type StartLocalRunner = (bridge: LocalRunnerBridge) => Promise<RunnerConnection>;

/** What {@link loadLocalIntegration} needs. */
export interface LoadLocalIntegrationOptions extends Omit<PrepareIntegrationOptions, "source"> {
  /** The permission sheet as data. */
  readonly sheet: unknown;
  /** The sheet as the user approved it; the loader refuses a sheet that changed since. */
  readonly approvedSheet?: unknown;
  /** The integration's folder, checked for links out of it before anything starts. */
  readonly folder: string;
  readonly start: StartLocalRunner;
  /** The disk the folder is on; this machine's unless a test passes another. */
  readonly folderDisk?: IntegrationFolderDisk;
}

/**
 * Loads a local integration into the runner. The sheet and the workspace's
 * choices are checked first, then the folder's links, and only then does a
 * runner start; its declaration must match the sheet, or it is stopped and
 * nothing is offered.
 *
 * The integration it returns connects to that runner. After an idle stop, the
 * next call starts a new one the same way, and refuses to go on when the code
 * declares something else. After any other stop, such as a blocked request
 * or a crash, the connection stays stopped, so a refused integration can't
 * try again by stopping itself.
 *
 * @example
 * const loaded = await loadLocalIntegration({ sheet, approvedSheet, folder, start, transport, secrets, tokens });
 * if (loaded.ok) connections.set(id, loaded.value.integration.connect(loaded.value.host));
 *
 * @throws what `start` throws when the first runner doesn't start
 */
export async function loadLocalIntegration(
  options: LoadLocalIntegrationOptions,
): Promise<Result<LoadedIntegration, LoadProblem[]>> {
  const { sheet, approvedSheet, folder, start, folderDisk, ...ports } = options;
  const prepared = prepareIntegration({
    ...ports,
    source: { origin: "local", sheet, ...(approvedSheet === undefined ? {} : { approvedSheet }) },
  });
  if (!prepared.ok) {
    return prepared;
  }
  const { readSecrets: _readSecrets, ...checked } = prepared.value;
  const links = folderLinkProblems(checked.sheet.id, folder, folderDisk);
  if (links.length > 0) {
    return err(links);
  }
  const runners = new LocalRunners(prepared.value, start, () =>
    folderLinkProblems(checked.sheet.id, folder, folderDisk),
  );
  const first = await runners.startFirst();
  const problems = declarationProblems(checked.sheet, first.declaration);
  if (problems.length > 0) {
    await first.close();
    return err(problems);
  }
  const { name, version, tools } = first.declaration;
  return ok({
    ...checked,
    integration: { name, version, tools, connect: (host) => runners.connect(host) },
  });
}

/** The runner of one local integration: the one running now, and how to start the next. */
class LocalRunners {
  readonly #prepared: PreparedIntegration;
  readonly #start: StartLocalRunner;
  /** The folder's link check, run again before every later start: the folder can change in between. */
  readonly #linkProblems: () => LoadProblem[];
  /** What the first runner declared, as JSON; every later one must declare the same. */
  #declared: string | undefined;
  #current: Promise<RunnerConnection> | undefined;
  /** Set once a runner stopped for any reason but idle, or a new one was refused: every later call fails with it. */
  #refused: Error | undefined;
  /** How many connections are open; the runner closes when the last one does. */
  #openConnections = 0;

  constructor(
    prepared: PreparedIntegration,
    start: StartLocalRunner,
    linkProblems: () => LoadProblem[],
  ) {
    this.#prepared = prepared;
    this.#start = start;
    this.#linkProblems = linkProblems;
  }

  async startFirst(): Promise<RunnerConnection> {
    const runner = await this.#running();
    this.#declared = JSON.stringify(runner.declaration);
    return runner;
  }

  /**
   * The connection the integration hands out: every call goes to the runner
   * running then. Every connection shares that runner, so it closes only when
   * the last open connection closes; a call on another one goes on. Once
   * closed, a connection refuses every call rather than start a new runner.
   */
  connect(host: IntegrationHost): IntegrationConnection {
    if (host !== this.#prepared.host) {
      throw new Error("a local integration connects only through the host its loader built");
    }
    let open = true;
    this.#openConnections += 1;
    return {
      callTool: async (name, args, signal) => {
        if (!open) {
          throw new Error(`${this.#prepared.sheet.id}: its connection is closed`);
        }
        return this.#call(name, args, signal);
      },
      close: async () => {
        if (!open) return;
        open = false;
        this.#openConnections -= 1;
        if (this.#openConnections === 0) await this.#closeRunner();
      },
    };
  }

  /**
   * Calls the tool on the runner running now. A runner can stop for being idle
   * after it was handed to this call but before it is let go; idle only stops
   * a runner with no call running, so this call never reached the code and is
   * made once more on a new runner.
   */
  async #call(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const current = this.#running();
    try {
      return await (await current).callTool(name, args, signal);
    } catch (error) {
      if (!(error instanceof RunnerStoppedError) || error.stop.reason !== "idle") {
        throw error;
      }
      if (this.#current === current) this.#current = undefined;
      return (await this.#running()).callTool(name, args, signal);
    }
  }

  async #closeRunner(): Promise<void> {
    const current = this.#current;
    this.#current = undefined;
    await (await current?.catch(() => undefined))?.close();
  }

  /** The runner running now, or a new one when the last one stopped for being idle. */
  #running(): Promise<RunnerConnection> {
    if (this.#refused !== undefined) {
      return Promise.reject(this.#refused);
    }
    this.#current ??= this.#startNext();
    return this.#current;
  }

  async #startNext(): Promise<RunnerConnection> {
    const { host, sheet, readSecrets } = this.#prepared;
    if (this.#declared !== undefined) {
      const links = this.#linkProblems();
      if (links.length > 0) {
        throw this.#refuse(new Error(links.map((problem) => problem.message).join("; ")));
      }
    }
    let runner: RunnerConnection;
    try {
      runner = await this.#start({
        http: host.http,
        settings: host.settings,
        tools: sheet.tools.map((tool) => tool.name),
        secrets: secretForms(await readSecrets()),
      });
    } catch (error) {
      this.#current = undefined;
      throw error;
    }
    if (this.#declared !== undefined && JSON.stringify(runner.declaration) !== this.#declared) {
      const refused = this.#refuse(
        new Error(`${sheet.id}: its code declares something else than when it was loaded`),
      );
      await runner.close();
      throw refused;
    }
    const started = this.#current;
    void runner.stopped.then((stop) => {
      if (this.#current === started) this.#current = undefined;
      if (stop.reason !== "idle" && stop.reason !== "closed") {
        this.#refuse(new RunnerStoppedError(stop));
      }
    });
    return runner;
  }

  /** Starts no runner again; every later call fails with the first reason. */
  #refuse(reason: Error): Error {
    this.#refused ??= reason;
    return this.#refused;
  }
}
