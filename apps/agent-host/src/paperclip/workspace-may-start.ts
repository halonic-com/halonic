// Whether a workspace may start a run, as the engine role's run gate reads it
// (`engineVersionChecks` in `../engine/open-engine.ts`), for the Paperclip key's
// hand-over: Studio's shell hands the kept key back only to a workspace that
// may, and the host refuses it itself otherwise (HAL-20278, HAL-20292).
import { basename } from "node:path";
import { nodeCommandSearch } from "@halonicjs/adapter-doctor-node";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import {
  type TrustReadMachine,
  WatchedVersions,
  workspaceTrustState,
} from "@halonicjs/adapter-workspace-engine-node";
import type { ProfileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { filesOf } from "@halonicjs/workspace";
import { openGitHistory } from "../engine/git-history.ts";
import { profileTrustStore } from "../profile-folder.ts";

/**
 * Whether the workspace at `workspaceRoot`, its real path, may start a run
 * now: `true` only when its trust is `trusted` or `not-needed`, read fresh at
 * each call. Anything else, an error included, is `false`.
 */
export type WorkspaceMayStart = (workspaceRoot: string) => Promise<boolean>;

/** What {@link workspaceMayStartWith} reads a workspace with. */
export interface MayStartReading {
  /** Gives the trust records, the clock and where commands are found, at each call, so each check reads them fresh. */
  machine: () => TrustReadMachine;
  /** The profile folder, which the workspace's files are fenced off, as the engine's store is. */
  fence: string;
  /** Hears an error that made the answer `false`; the answer itself says no more. */
  report?: ((error: unknown) => void) | undefined;
}

/**
 * The run gate for the profile the shell named with `--profile-folder`: its
 * trust records, the system clock and this computer's commands.
 */
export function profileWorkspaceMayStart(
  profile: ProfileFolder,
  report?: (error: unknown) => void,
): WorkspaceMayStart {
  return workspaceMayStartWith({
    machine: () => ({
      trustStore: profileTrustStore(profile.root),
      clock: systemClock,
      commandSearch: nodeCommandSearch(),
    }),
    fence: profile.root,
    report,
  });
}

/**
 * The run gate on `reading`'s machine: it opens the workspace's versions as
 * the engine role does, reads trust for the version a run would start from,
 * and closes the versions again, whatever the answer.
 */
export function workspaceMayStartWith(reading: MayStartReading): WorkspaceMayStart {
  return async (workspaceRoot) => {
    try {
      return await mayStart(workspaceRoot, reading);
    } catch (error) {
      // Failing closed is the answer: a gate that can't read the workspace lets nothing through.
      reading.report?.(error);
      return false;
    }
  };
}

async function mayStart(root: string, reading: MayStartReading): Promise<boolean> {
  const dir = {
    root,
    shown: root,
    name: basename(root),
    store: new FolderDefinitionStore(root, root, { fence: reading.fence }),
  };
  const versions = await WatchedVersions.open(dir, openGitHistory);
  try {
    // An empty or missing folder needs no trust, but it is no workspace, so it starts nothing.
    if (filesOf(versions.latest(), "workspace").length === 0) {
      throw new Error("The folder holds no workspace.yaml.");
    }
    const { state } = await workspaceTrustState(dir, reading.machine(), async () =>
      versions.latestVersion(),
    );
    return state === "trusted" || state === "not-needed";
  } finally {
    await versions.close();
  }
}
