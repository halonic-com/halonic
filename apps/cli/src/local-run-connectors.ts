// The connectors of the CLI engine's runs, as `openLocalEngine` wires them
// into the executor (HAL-6277): each top-level run's own, started from its
// hub's connector files in the folder its programs start in, and what a
// connector call checks at the engine's side-effect boundary.

import type { ConnectorFactories, SendingSettings } from "@halonicjs/app";
import type { ConnectorsRun } from "@halonicjs/engine";
import type { Connector } from "@halonicjs/format";
import type { ConnectorFactoryContext, Secrets, TrustGrant } from "@halonicjs/ports";
import { definitionsOf, type LoadedWorkspace } from "@halonicjs/workspace";
import type { ProgramFolders } from "./program-folders.ts";
import { FolderRunConnectors } from "./run-connectors.ts";
import { programWorkingFolders } from "./working-folders.ts";

/** What the engine's runs start their connectors with, as the command gives it. */
export interface LocalRunConnectorsInput {
  /** The CLI's `stdio` and `http` factories (`cliConnectorFactories`). */
  readonly factories: ConnectorFactories;
  /** The sign-ins and the HTTP client a connector reaches its server with; the secrets are the engine's. */
  readonly context: Pick<ConnectorFactoryContext, "tokens" | "http">;
  /**
   * The grant from the command's trust check: `null` when the workspace
   * isn't trusted, so no connector program starts.
   */
  readonly trust: TrustGrant | null;
}

/** The parts of the engine the runs' connectors are built on. */
export interface RunConnectorsEngine {
  /** The workspace the engine's runs read. */
  readonly workspace: LoadedWorkspace;
  /**
   * Whether every run reads `workspace`. An engine over several versions
   * (`versions`) starts no run's connectors yet: a run's connector files may
   * be of another version than the one it read last.
   */
  readonly readsOneVersion: boolean;
  /** The workspace's real path, which with a connector's id keys its settings. */
  readonly location: string;
  readonly secrets: Secrets;
  readonly programFolders: ProgramFolders;
  /** Hears what couldn't be closed or released, and a settings error. */
  reportError(error: unknown): void;
}

/** The runs options that give runs their connectors. */
export interface LocalRunConnectors {
  readonly runs: {
    readonly runConnectors: FolderRunConnectors;
    /** What a run's connector call checks at the engine's side-effect boundary. */
    readonly connectorCalls: {
      readonly location: string;
      readonly sending: SendingSettings;
      reportSettingsError(connector: string, error: unknown): void;
    };
  };
}

/**
 * What the CLI answers every connector's sending check with: off, as it
 * keeps no connector settings yet. Only tools labelled `send` are refused.
 */
const sendingOff: SendingSettings = {
  checkSending: async ({ connector }) => ({
    allowed: false,
    reason: `sending is off for the connector "${connector}": the CLI can't switch it on yet`,
  }),
};

/**
 * The runs' connectors on `engine`. Close them with
 * `runs.runConnectors.closeAll()` once the executor and scheduler have
 * closed, before the program folders.
 */
export function localRunConnectors(
  given: LocalRunConnectorsInput,
  engine: RunConnectorsEngine,
): LocalRunConnectors {
  const runConnectors = new FolderRunConnectors({
    factories: given.factories,
    programFolders: engine.programFolders,
    context: { ...given.context, secrets: engine.secrets, trust: given.trust },
    connectorsOf: async (run) => connectorFilesOf(engine, run),
    workingFoldersOf: (folder) => programWorkingFolders(folder, engine.location, engine.workspace),
    reportError: engine.reportError,
  });
  return {
    runs: {
      runConnectors,
      connectorCalls: {
        location: engine.location,
        sending: sendingOff,
        reportSettingsError: (connector, error) => {
          const reason = error instanceof Error ? error.message : String(error);
          engine.reportError(
            new Error(
              `The sending settings of the connector "${connector}" couldn't be read: ${reason}`,
              {
                cause: error,
              },
            ),
          );
        },
      },
    },
  };
}

/**
 * The connector files a run's hub can see.
 *
 * @throws when the engine's runs read more than one version
 */
function connectorFilesOf(engine: RunConnectorsEngine, run: ConnectorsRun): Connector[] {
  if (!engine.readsOneVersion) {
    throw new Error(
      `Run "${run.runId}" read one of several versions of the workspace, and its connectors can't start from those yet.`,
    );
  }
  return Object.values(definitionsOf(engine.workspace, run.hubId).connectors);
}
