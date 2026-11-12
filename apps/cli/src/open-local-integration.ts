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
  integrationsFolder,
  type RunnerStartGate,
  readIntegrationFolder,
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
    const { id, context } = this.#request;
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
    const { sheet } = await this.#read();
    const loaded = await loadLocalIntegration({
      sheet,
      approvedSheet: sheet,
      folder,
      start: (bridge) => this.#start(starts, folder, bridge),
      transport: this.#machine.transport,
      secrets: context.secrets,
      tokens: context.tokens,
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

  async #start(
    starts: TrustedRunnerStart,
    folder: string,
    bridge: LocalRunnerBridge,
  ): Promise<RunnerConnection> {
    const { runtime, runnerExists = existsSync, startRunner: begin = startRunner } = this.#machine;
    if (!runnerExists(runtime.runnerFile)) {
      throw new Error("the integration runner isn't built");
    }
    const trust = await this.#machine.trustCheck(this.#request.context);
    const runnerMachine = await this.#machine.runnerMachine();
    const gated = await starts.start(
      { trust, folder: this.#folder, settings: bridge.settings },
      (sandbox): Promise<StartedRunner> =>
        begin({
          sandbox,
          files: { ...runtime, integrationFolder: folder },
          entry: { file: join(folder, DEFAULT_BACKEND_ENTRY), exportName: "default" },
          machine: runnerMachine,
          settings: bridge.settings,
          tools: bridge.tools,
          http: bridge.http,
          secrets: bridge.secrets,
        }),
    );
    if (gated.run === "fenced" || gated.run === "unfenced") return gated.runner;
    throw new Error(
      gated.run === "needs-yes"
        ? `the sandbox isn't available here (${gated.reason}) and running without it isn't allowed yet`
        : "the sandbox failed its check, so nothing runs",
    );
  }
}
