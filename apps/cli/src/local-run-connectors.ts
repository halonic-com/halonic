// The connectors of the CLI engine's runs, as `openLocalEngine` wires them
// into the executor (HAL-6277): each top-level run's own, started from its
// hub's connector files in the version it read, in the folder its programs
// start in, and what a connector call checks at the engine's side-effect
// boundary.

import type { ConnectorFactories, SendingSettings } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";
import type { ConnectorFactoryContext, Secrets, TrustGrant } from "@halonicjs/ports";
import { definitionsOf, type LoadedWorkspace } from "@halonicjs/workspace";
import type { ProgramFolders } from "./program-folders.ts";
import { FolderRunConnectors, type VersionedRun } from "./run-connectors.ts";
import { programWorkingFolders } from "./working-folders.ts";

/** What the engine's runs start their connectors with, as the command gives it. */
export interface LocalRunConnectorsInput {
  /** The CLI's `stdio` and `http` factories (`cliConnectorFactories`). */
  readonly factories: ConnectorFactories;
  /** The sign-ins and the HTTP client a connector reaches its server with; the secrets are the engine's. */
  readonly context: Pick<ConnectorFactoryContext, "tokens" | "http">;
  /**
   * The grant from the command's trust check: `null` when the workspace
   * can only reach the test model, so no connector program starts. An
   * engine over several versions starts each run's with the grant of the
   * version it read instead.
   */
  readonly trust: TrustGrant | null;
}

/** A version of the workspace a run read, with the grant of its trust check. */
export interface TrustedVersion {
  readonly workspace: LoadedWorkspace;
  /** `null` for a version that can only reach the test model, which starts no program. */
  readonly trust: TrustGrant | null;
}

/** The parts of the engine the runs' connectors are built on. */
export interface RunConnectorsEngine {
  /** The workspace the engine's runs read, when they read one version. */
  readonly workspace: LoadedWorkspace;
  /**
   * The versions the engine's runs read, as `routines watch`'s do: a run's
   * connectors then start from the version it read, never the one read
   * last, with that version's grant.
   */
  readonly versions?: {
    /** @throws when that version can't be read or may not run here */
    trustedVersionOf(version: RunVersion): Promise<TrustedVersion>;
  };
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
    context: { ...given.context, secrets: engine.secrets },
    versionOf: async (run) => {
      const read = await versionRead(given, engine, run);
      return {
        connectors: Object.values(definitionsOf(read.workspace, run.hubId).connectors),
        trust: read.trust,
        workingFoldersOf: (folder) =>
          programWorkingFolders(folder, engine.location, read.workspace),
      };
    },
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
 * The version `run` read, and the grant its connectors start with: the
 * engine's one workspace and the command's grant, or the run's own version
 * of an engine over several.
 *
 * @throws when the run's version can't be read or may not run here
 */
async function versionRead(
  given: LocalRunConnectorsInput,
  engine: RunConnectorsEngine,
  run: VersionedRun,
): Promise<TrustedVersion> {
  if (engine.versions === undefined) {
    return { workspace: engine.workspace, trust: given.trust };
  }
  return await engine.versions.trustedVersionOf(run.version);
}
