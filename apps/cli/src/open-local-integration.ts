// Opens a local integration for a run (HAL-8089): the trust check, the start
// gate and the runner, in one place. Every start of its runner, the first and
// each one after an idle stop, asks the trust check again and the gate again,
// so a folder edited while the run goes loses its trust at the next start and
// nothing runs. The integration's code never loads here: it runs in the
// runner, and a start the gate doesn't allow starts nothing, with no
// in-process fallback.
//
// What is read and hashed is the folder the runner starts from (HAL-16335):
// the copy of the run's commit, or the workspace folder with history off.
// Never the saved files beside a copy, so the code a person trusted is the
// code that runs.
//
// A runner whose code reaches for a host its sheet doesn't list, or tries to
// leak a secret, pauses its connector (HAL-19188): the pause is made and the
// runner stopped before the refusal reaches the code, and every later start
// of the connector, in this run or another, is refused until its code changes
// and is trusted again (`RunnerBlockPause`, `TrustedRunnerStart`).

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import {
  integrationConnectorClient,
  type LocalRequestLog,
  type LocalRunnerBridge,
  loadLocalIntegration,
  type RunnerConnection,
  type RunnerFiles,
  type RunnerMachine,
  type StartedRunner,
  startRunner,
} from "@halonicjs/adapter-integration-runner";
import {
  type ConnectorPauses,
  type IntegrationFolder,
  IntegrationNotTrustedError,
  integrationsFolder,
  type RunnerStartGate,
  readIntegrationFolder,
  runnerUnfencedWords,
  type TrustCheck,
  TrustedRunnerStart,
} from "@halonicjs/app";
import { DEFAULT_BACKEND_ENTRY } from "@halonicjs/format";
import type {
  ConnectorClient,
  ConnectorFactoryContext,
  Digest,
  FolderReader,
} from "@halonicjs/ports";
import type { OpenIntegration, OpenIntegrationRequest } from "./integration-connector-factory.ts";
import { RunnerBlockPause } from "./runner-block-pause.ts";

/**
 * The sandbox isn't available here and the person hasn't allowed the
 * integration to run without it, so nothing started. The engine logs
 * `sandboxReason`, the gate's code (`container`, `windows`, …), as the
 * cause's name (`ports.connector-start-failure`), so `halonic run` can say
 * the reason and the fix; the message, which may name the yes's file, stays
 * out of the log.
 */
export class UnfencedStartNotAllowedError extends Error {
  override readonly name = "UnfencedStartNotAllowedError";
  /** Why the sandbox isn't available, as the start gate names it. */
  readonly sandboxReason: string;

  constructor(sandboxReason: string, message: string) {
    super(message);
    this.sandboxReason = sandboxReason;
  }
}

/** The files a runner starts from, except the integration's own folder, which is the connector's. */
export type RunnerRuntime = Omit<RunnerFiles, "integrationFolder">;

/** What opening a local integration uses on this computer, so tests can fix it. */
export interface LocalIntegrationMachine {
  /**
   * The folder a runner starts from, `context.workspaceRoot`, read without
   * following links: the copy of the run's commit, or the workspace folder
   * with history off.
   */
  folderAt(root: string): FolderReader;
  /** The hash the trust check uses. */
  readonly digest: Digest;
  /** Picks the sandbox the runner starts in, at every start. */
  readonly gate: RunnerStartGate;
  /** The paused connectors in the profile, read at every start and added to when a runner is blocked. */
  readonly pauses: ConnectorPauses;
  /** Hears a pause that couldn't be saved; it holds for this process all the same. */
  pauseNotSaved?(error: unknown): void;
  /** The saved yes's file when the gate's last read of it failed, so the refusal names it. */
  unreadableYes?(): string | undefined;
  /** Whether a yes given in Studio reaches this command; when it doesn't, the refusal doesn't send the person there. Left out, it does. */
  studioYesReaches?(): Promise<boolean>;
  /** Called when a runner started without the sandbox, with the user's yes for `reason`. */
  startedUnfenced?(reason: string): void;
  /** Node and the built runner. */
  readonly runtime: RunnerRuntime;
  /** What the runner's requests go out through; the integration's own sheet limits the hosts. */
  readonly transport: AddressCheckingHttpClient;
  /**
   * The workspace's trust check as it is now, on the integrations in the
   * folder the runner starts from (`context.workspaceRoot`). It is called at
   * every start and its answer is never kept, so a change after the run
   * began is seen.
   */
  trustCheck(context: ConnectorFactoryContext): Promise<TrustCheck>;
  /** What one runner start needs from this computer; a fresh temp folder each time. */
  runnerMachine(): Promise<RunnerMachine>;
  /** Whether the built runner is there; this computer's disk unless a test says otherwise. */
  runnerExists?(file: string): boolean;
  /** Starts a runner in the sandbox the gate picked; `startRunner` unless a test says otherwise. */
  startRunner?: typeof startRunner;
  /**
   * Where the integration's requests and failed calls are kept for the Build chat's
   * `read_request_log`: the profile's store, under the workspace's key. Left out, they aren't kept.
   */
  requestLog?(): Promise<LocalRequestLog>;
}

/**
 * The opener the `integration` connector factory is given. The integration's
 * entry is `backend/index.js` in its folder and its export is `default`, as for
 * a plugin's backend.
 *
 * @example
 * new IntegrationConnectorFactory(openLocalIntegration(machine));
 */
export function openLocalIntegration(machine: LocalIntegrationMachine): OpenIntegration {
  return async (request) => await new LocalIntegrationOpening(machine, request).open();
}

class LocalIntegrationOpening {
  readonly #machine: LocalIntegrationMachine;
  readonly #request: OpenIntegrationRequest;
  /** The folder as the trust content names it, relative to the workspace. */
  readonly #folder: string;

  constructor(machine: LocalIntegrationMachine, request: OpenIntegrationRequest) {
    this.#machine = machine;
    this.#request = request;
    this.#folder = `${integrationsFolder}/${request.folder}`;
  }

  async open(): Promise<ConnectorClient> {
    const { id, settings, secretNames, context } = this.#request;
    const { workspaceRoot } = context;
    if (workspaceRoot === undefined) {
      throw new Error("there is no workspace folder to run it from");
    }
    const folder = join(workspaceRoot, this.#folder);
    // The runner runs `folder`, so the read here and the hash at every start are of it too.
    const startsFrom = this.#machine.folderAt(workspaceRoot);
    const starts = new TrustedRunnerStart({
      workspace: startsFrom,
      digest: this.#machine.digest,
      gate: this.#machine.gate,
      pauses: this.#machine.pauses,
    });
    const { sheet, code } = await this.#read(startsFrom);
    const requestLog = await this.#machine.requestLog?.();
    const loaded = await loadLocalIntegration({
      sheet,
      approvedSheet: sheet,
      folder,
      start: (bridge) => this.#start(starts, folder, code, bridge),
      transport: this.#machine.transport,
      secrets: context.secrets,
      tokens: context.tokens,
      // The trust check reads the same settings from the connector file
      // (`trustContentInputOf`), so the start compares the addresses it showed.
      choices: { settings, secretNames },
      ...(requestLog === undefined ? {} : { requestLog }),
    });
    if (!loaded.ok) {
      throw new Error(loaded.error.map((problem) => problem.message).join("; "));
    }
    return integrationConnectorClient({ id, loaded: loaded.value });
  }

  /**
   * The folder as it is now. Reading starts nothing; the start checks the
   * trust again, so the sheet the loader checks is the one that was trusted.
   */
  async #read(startsFrom: FolderReader): Promise<IntegrationFolder> {
    const read = await readIntegrationFolder(startsFrom, this.#machine.digest, this.#folder);
    if (!read.ok) throw new Error(read.error.map((problem) => problem.message).join(" "));
    return read.value;
  }

  /**
   * The sheet the loader enforces came from the first read. At every start its
   * code must be the code the workspace trusted, so a sheet edited before the
   * read and put back before the start can't set the runner's hosts and secrets.
   * Anything else is left to `TrustedRunnerStart`, which reads the folder again.
   */
  #requireTrustedCode(trust: TrustCheck, readCode: string): void {
    if (trust.status !== "trusted") return;
    const trusted = (trust.content.integrations ?? []).find(
      (integration) => integration.folder === this.#folder,
    );
    if (trusted !== undefined && trusted.code !== readCode) {
      throw new IntegrationNotTrustedError(this.#folder, "code-changed");
    }
  }

  async #start(
    starts: TrustedRunnerStart,
    folder: string,
    readCode: string,
    bridge: LocalRunnerBridge,
  ): Promise<RunnerConnection> {
    const { runtime, runnerExists = existsSync, startRunner: begin = startRunner } = this.#machine;
    if (!runnerExists(runtime.runnerFile)) {
      throw new Error("the integration runner isn't built");
    }
    const trust = await this.#machine.trustCheck(this.#request.context);
    this.#requireTrustedCode(trust, readCode);
    const runnerMachine = await this.#machine.runnerMachine();
    const pausing = this.#pausing(trust, readCode);
    const gated = await starts.start(
      { trust, folder: this.#folder, connector: this.#request.id, settings: bridge.settings },
      (sandbox, backend): Promise<StartedRunner> =>
        begin({
          sandbox,
          files: { ...runtime, integrationFolder: folder },
          entry: { file: join(folder, DEFAULT_BACKEND_ENTRY), exportName: "default" },
          machine: { ...runnerMachine, backend },
          settings: bridge.settings,
          tools: bridge.tools,
          http: bridge.http,
          secrets: bridge.secrets,
          onBlocked: pausing.onBlocked,
        }),
    );
    if (gated.run === "unfenced") this.#machine.startedUnfenced?.(gated.reason);
    if (gated.run === "fenced" || gated.run === "unfenced") return pausing.started(gated.runner);
    if (gated.run === "stopped") throw new Error(this.#stopped());
    throw new UnfencedStartNotAllowedError(gated.reason, await this.#needsYes(gated.reason));
  }

  /**
   * What pauses this start's connector when its runner is blocked. Its key is
   * the code that was read and trusted; a start only goes on when the trust
   * check is `trusted`, so a block always has the workspace's location.
   */
  #pausing(trust: TrustCheck, readCode: string): RunnerBlockPause {
    const location = trust.status === "trusted" ? trust.grant.location : "";
    const key = { location, connector: this.#request.id, code: readCode };
    return new RunnerBlockPause(this.#machine.pauses, key, (error) =>
      this.#machine.pauseNotSaved?.(error),
    );
  }

  /**
   * Why a start whose fence proof failed started nothing (HAL-15666). The
   * computer passed the sandbox check, so it never says the check failed. The
   * connector's start error wraps it, so it starts lower case and has no colon;
   * the words are the plugin's in `cli.run-connector-warning`, naming the folder.
   */
  #stopped(): string {
    const name = this.#request.folder;
    return `the sandbox didn't work when the integration ${name} started, so none of it ran. Halonic tries ${name} in the sandbox again the next time a run uses it.`;
  }

  /**
   * Why a start that needs the user's yes started nothing, and where to give
   * it (microcopy 24.1 R18, its fix decided by the team on HAL-15144). A
   * saved yes that can't be read blocks the start too, and names its file. Where Studio's yes
   * doesn't reach the command (Windows with the WSL sandbox), Studio can't start the run either,
   * so the refusal ends with R3's reason and its fix, in place of the raw code (C665-57, C681).
   */
  async #needsYes(reason: string): Promise<string> {
    const reaches = (await this.#machine.studioYesReaches?.()) ?? true;
    const unreadable = this.#machine.unreadableYes?.();
    if (!reaches) {
      const words = runnerUnfencedWords(reason, "integration");
      const why = `${afterColon(words.reason)} ${words.fix}`;
      return unreadable === undefined
        ? why
        : `the saved yes to run without the sandbox can't be read (${JSON.stringify(unreadable)}), and ${why}`;
    }
    const allow = " To allow it, open Settings › Agent sandbox in Studio on this computer.";
    if (unreadable !== undefined) {
      return `the sandbox isn't available here (${reason}) and the saved yes to run without it can't be read (${JSON.stringify(unreadable)}), so nothing runs.${allow}`;
    }
    return `the sandbox isn't available here (${reason}) and running without it isn't allowed yet.${allow}`;
  }
}

/** The words that may start R3's reason and read in lower case after "didn't start:". */
const sentenceOpeners = new Set(["On", "The", "This", "Your"]);

/** R3's reason as the rest of a sentence: "On Windows, …" reads "on Windows, …". */
function afterColon(reason: string): string {
  const firstWord = reason.split(" ")[0]?.replace(/,$/, "") ?? "";
  return sentenceOpeners.has(firstWord) ? reason.charAt(0).toLowerCase() + reason.slice(1) : reason;
}
