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
import { type Connector, connectorIsLocal } from "@halonicjs/format";
import type { ConnectorClient, ConnectorFactoryContext } from "@halonicjs/ports";
import type { ProgramFolders } from "./program-folders.ts";

/** What {@link FolderRunConnectors} starts a run's connectors with. */
export interface FolderRunConnectorsInput {
  /** The CLI's `stdio` and `http` factories (`cliConnectorFactories`). */
  readonly factories: ConnectorFactories;
  /** Where a run's programs start: a copy at its commit for a live run. */
  readonly programFolders: Pick<ProgramFolders, "folderFor">;
  /**
   * What every connector starts with, but its folder: the secrets, sign-ins,
   * HTTP client and the trust grant from the command's trust check, `null`
   * when the workspace isn't trusted, so no program starts.
   */
  readonly context: Omit<ConnectorFactoryContext, "workspaceRoot" | "workingFolders">;
  /**
   * The connector files the run's hub can see, in the version the run read.
   *
   * @throws when that version can't be read; the step that needed a connector fails
   */
  connectorsOf(run: ConnectorsRun): Promise<readonly Connector[]>;
  /**
   * The real working folders of the harness agents under `folder`, so a
   * program that would start from one is refused (`format.working-folder-start`).
   */
  workingFoldersOf(folder: string): Promise<readonly string[]>;
  /** Hears what couldn't be closed or released when a run's connectors end. */
  reportError(error: unknown): void;
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
 * const connectors = new FolderRunConnectors({ factories, programFolders, context, connectorsOf, workingFoldersOf, reportError });
 * new LocalExecutor({ …, runs: { …, runConnectors: connectors } });
 * // once the executor and scheduler have closed:
 * await connectors.closeAll();
 */
export class FolderRunConnectors implements RunConnectors {
  readonly #input: FolderRunConnectorsInput;
  readonly #open = new Map<string, Promise<OpenConnectors>>();

  constructor(input: FolderRunConnectorsInput) {
    this.#input = input;
  }

  /**
   * @throws when the run names no version, its folder can't be made, or a
   *   connector of its hub can't be created; what did start is closed
   */
  async open(run: ConnectorsRun): Promise<readonly ConnectorClient[]> {
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
    await Promise.all([...this.#open.keys()].map((runId) => this.end(runId)));
  }

  async #start(run: ConnectorsRun): Promise<OpenConnectors> {
    if (run.version === null) {
      throw new Error(
        `Run "${run.runId}" doesn't name the version of the workspace it read, so its connectors can't start.`,
      );
    }
    const files = await this.#input.connectorsOf(run);
    const folder = await this.#input.programFolders.folderFor(run.version);
    const clients: ConnectorClient[] = [];
    try {
      const context: ConnectorFactoryContext = {
        ...this.#input.context,
        workspaceRoot: folder.path,
        workingFolders: await this.#input.workingFoldersOf(folder.path),
      };
      for (const file of files) {
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
