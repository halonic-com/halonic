// The connectors of the local engine's runs (HAL-6277, requirement
// `engine.run-connectors`): each top-level run gets its own, started in the
// folder its programs start in (`programFolders.folderFor`, HAL-4975). A
// live run's connector program is the script in a copy at the run's commit,
// so a saved change that isn't live, such as a script an agent wrote, never
// runs before someone made it live (`app.runs-read-latest-version`).
//
// The engine opens them at the first step that needs one and ends them when
// the run ends; the engine's own close ends the rest, before the copies go.

import { type ConnectorFactories, connectorConfigOf } from "@halonicjs/app";
import type { ConnectorsRun, RunConnectors } from "@halonicjs/engine";
import type { RunVersion } from "@halonicjs/events";
import { type Connector, connectorIsLocal } from "@halonicjs/format";
import type { ConnectorClient, ConnectorFactoryContext, TrustGrant } from "@halonicjs/ports";
import type { ProgramFolders } from "./program-folders.ts";

/** What {@link FolderRunConnectors} starts a run's connectors with. */
export interface FolderRunConnectorsInput {
  /** The CLI's `stdio` and `http` factories (`cliConnectorFactories`). */
  readonly factories: ConnectorFactories;
  /** Where a run's programs start: a copy at its commit for a live run. */
  readonly programFolders: Pick<ProgramFolders, "folderFor">;
  /**
   * What every connector starts with, but its folder and its grant: the
   * secrets, sign-ins and HTTP client.
   */
  readonly context: Omit<ConnectorFactoryContext, "workspaceRoot" | "workingFolders" | "trust">;
  /**
   * The version the run read, as its connectors start from it.
   *
   * @throws when that version can't be read or may not run here; the step that needed a connector fails
   */
  versionOf(run: VersionedRun): Promise<RunConnectorsVersion>;
  /** Hears that a run has ended, whether or not it started connectors. */
  runEnded(runId: string): void;
  /** Hears what couldn't be closed or released when a run's connectors end. */
  reportError(error: unknown): void;
}

/** A run that names the version of the workspace it read, as every run's connectors need. */
export type VersionedRun = ConnectorsRun & { readonly version: RunVersion };

/**
 * What a run's connectors start from: the version of the workspace the run
 * read, so a run calls the connectors it started with, not the workspace's
 * as they are now.
 */
export interface RunConnectorsVersion {
  /** The connector files the run's hub can see in that version. */
  readonly connectors: readonly Connector[];
  /**
   * The grant from that version's trust check, `null` when the version can
   * only reach the test model, so no program starts.
   */
  readonly trust: TrustGrant | null;
  /**
   * The real working folders of that version's harness agents under
   * `folder`, so a program that would start from one is refused
   * (`format.working-folder-start`).
   */
  workingFoldersOf(folder: string): Promise<readonly string[]>;
}

/** A run's started connectors, and the hold on the folder they started in. */
interface OpenConnectors {
  readonly clients: readonly ConnectorClient[];
  release(): Promise<void>;
}

/**
 * The runs' connectors, each run's started in its own program folder. Two
 * steps of a run that open them at once share one start.
 *
 * @example
 * const connectors = new FolderRunConnectors({ factories, programFolders, context, versionOf, reportError });
 * new LocalExecutor({ …, runs: { …, runConnectors: connectors } });
 * // once the executor and scheduler have closed:
 * await connectors.closeAll();
 */
export class FolderRunConnectors implements RunConnectors {
  readonly #input: FolderRunConnectorsInput;
  readonly #open = new Map<string, Promise<OpenConnectors>>();
  /** Set by `closeAll`: a program started after it would never be closed. */
  #closed = false;

  constructor(input: FolderRunConnectorsInput) {
    this.#input = input;
  }

  /**
   * @throws when the run names no version, its folder can't be made, or a
   *   connector of its hub can't be created; what did start is closed
   * @throws when the engine has closed
   */
  async open(run: ConnectorsRun): Promise<readonly ConnectorClient[]> {
    if (this.#closed) {
      throw new Error(`Run "${run.runId}" can't start its connectors: the engine has closed.`);
    }
    let opening = this.#open.get(run.runId);
    if (opening === undefined) {
      opening = this.#start(run);
      this.#open.set(run.runId, opening);
      // A start that failed is tried again by the run's next step.
      const started = opening;
      started.catch(() => {
        if (this.#open.get(run.runId) === started) this.#open.delete(run.runId);
      });
    }
    return (await opening).clients;
  }

  async end(runId: string): Promise<void> {
    this.#input.runEnded(runId);
    const opening = this.#open.get(runId);
    if (opening === undefined) return;
    this.#open.delete(runId);
    // A start that failed has closed what it started, and holds nothing.
    const opened = await opening.catch(() => undefined);
    if (opened === undefined) return;
    const closed = await Promise.allSettled(opened.clients.map((client) => client.close()));
    for (const each of closed) {
      if (each.status === "rejected") this.#input.reportError(each.reason);
    }
    // After the programs stopped, so none runs in a folder that is going.
    await opened.release().catch((error: unknown) => this.#input.reportError(error));
  }

  /** Ends the connectors of every run still open, as the engine closes. Never throws. */
  async closeAll(): Promise<void> {
    this.#closed = true;
    await Promise.all([...this.#open.keys()].map((runId) => this.end(runId)));
  }

  async #start(run: ConnectorsRun): Promise<OpenConnectors> {
    const { version } = run;
    if (version === null) {
      throw new Error(
        `Run "${run.runId}" doesn't name the version of the workspace it read, so its connectors can't start.`,
      );
    }
    const read = await this.#input.versionOf({ ...run, version });
    const folder = await this.#input.programFolders.folderFor(version);
    const clients: ConnectorClient[] = [];
    try {
      const context: ConnectorFactoryContext = {
        ...this.#input.context,
        trust: read.trust,
        workspaceRoot: folder.path,
        workingFolders: await read.workingFoldersOf(folder.path),
      };
      for (const file of read.connectors) {
        const local = connectorIsLocal(file);
        // The engine would drop it anyway (`engine.local-only`): don't start it.
        if (run.localOnly && !local) continue;
        const config = connectorConfigOf(file);
        // Such as the built-in Google connector: a call to it says it isn't connected.
        if (!this.#input.factories.serves(config.transport.kind)) continue;
        clients.push(markedLocal(this.#input.factories.create(config, context), local));
      }
      return { clients, release: () => folder.release() };
    } catch (error) {
      await Promise.allSettled(clients.map((client) => client.close()));
      await folder
        .release()
        .catch((releaseError: unknown) => this.#input.reportError(releaseError));
      throw error;
    }
  }
}

/**
 * `client`, saying whether its connector runs on this computer, as
 * `connectorIsLocal` reads its file. In a local-only workspace the engine
 * calls only the connectors marked `local` (`engine.local-only`).
 */
function markedLocal(client: ConnectorClient, local: boolean): ConnectorClient {
  return {
    id: client.id,
    local,
    listTools: () => client.listTools(),
    callTool: (name, args, options) => client.callTool(name, args, options),
    close: () => client.close(),
  };
}
