// Opens a local integration for a run (HAL-8089): the trust check, the start
// gate and the runner, in one place. Every start of its runner, the first and
// each one after an idle stop, asks the trust check again and the gate again,
// so a folder edited while the run goes loses its trust at the next start and
// nothing runs. The integration's code never loads here: it runs in the
// runner, and a start the gate doesn't allow starts nothing, with no
// in-process fallback.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import {
  integrationConnectorClient,
  type LocalRunnerBridge,
  loadLocalIntegration,
  type RunnerConnection,
  type RunnerFiles,
  type RunnerMachine,
  type StartedRunner,
  startRunner,
} from "@halonicjs/adapter-integration-runner";
import {
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

/** The files a runner starts from, except the integration's own folder, which is the connector's. */
export type RunnerRuntime = Omit<RunnerFiles, "integrationFolder">;

/** What opening a local integration uses on this computer, so tests can fix it. */
export interface LocalIntegrationMachine {
  /** The workspace folder, read without following links. */
  readonly workspace: FolderReader;
  /** The hash the trust check uses. */
  readonly digest: Digest;
  /** Picks the sandbox the runner starts in, at every start. */
  readonly gate: RunnerStartGate;
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
   * The workspace's trust check as it is now. It is called at every start and
   * its answer is never kept, so a change after the run began is seen.
   */
  trustCheck(context: ConnectorFactoryContext): Promise<TrustCheck>;
  /** What one runner start needs from this computer; a fresh temp folder each time. */
  runnerMachine(): Promise<RunnerMachine>;
  /** Whether the built runner is there; this computer's disk unless a test says otherwise. */
  runnerExists?(file: string): boolean;
  /** Starts a runner in the sandbox the gate picked; `startRunner` unless a test says otherwise. */
  startRunner?: typeof startRunner;
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
    const starts = new TrustedRunnerStart({
      workspace: this.#machine.workspace,
      digest: this.#machine.digest,
      gate: this.#machine.gate,
    });
    const { sheet, code } = await this.#read();
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
  async #read(): Promise<IntegrationFolder> {
    const read = await readIntegrationFolder(
      this.#machine.workspace,
      this.#machine.digest,
      this.#folder,
    );
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
    const gated = await starts.start(
      { trust, folder: this.#folder, settings: bridge.settings },
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
        }),
    );
    if (gated.run === "unfenced") this.#machine.startedUnfenced?.(gated.reason);
    if (gated.run === "fenced" || gated.run === "unfenced") return gated.runner;
    if (gated.run === "stopped") throw new Error(this.#stopped());
    throw new Error(await this.#needsYes(gated.reason));
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
   * doesn't reach the command (Windows with the WSL sandbox), the fix sends the run to Studio,
   * where the yes applies, and says why (C612, then C666 #3); the reason before it is R3's, with
   * its fix, in place of the raw code (C665-57).
   */
  async #needsYes(reason: string): Promise<string> {
    const reaches = (await this.#machine.studioYesReaches?.()) ?? true;
    const allow = reaches
      ? " To allow it, trust this workspace in Studio on this computer."
      : " Start the run in Halonic Studio, where you can allow it: on this computer, the halonic command can't see a yes given in Studio.";
    const unreadable = this.#machine.unreadableYes?.();
    if (unreadable !== undefined) {
      return `the sandbox isn't available here (${reason}) and the saved yes to run without it can't be read (${JSON.stringify(unreadable)}), so nothing runs.${allow}`;
    }
    if (!reaches) {
      const words = runnerUnfencedWords(reason, "integration");
      return `${afterColon(words.reason)} ${words.fix}${allow}`;
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
