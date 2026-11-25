import { realpathSync, statSync } from "node:fs";

/** Why a folder Studio's shell named couldn't become a workspace. */
export type OpenedWorkspaceRefusal = "missing" | "not_a_folder" | "profile_folder";

/** What naming a folder did: the real path the host now accepts, or why it didn't. */
export type OpenedWorkspace = { added: string } | { refused: OpenedWorkspaceRefusal };

/**
 * Adds `folder`, a folder the person opened after the host started, to
 * `workspaceRoots`, the list every workspace route checks with
 * `namedWorkspace` (requirement `agent-host.opened-workspaces`). The routes
 * hold that same list, so they accept the folder from now on, until the host
 * stops: nothing is saved.
 *
 * Only Studio's shell can name one, on its own channel (see
 * `ShellChannel`); no route takes a folder to add. It is checked and added
 * at once, while the shell's frame is read, and only then does the channel
 * answer `noticed`, which the shell waits for: so the shell's next request
 * finds it. The real path is kept, so
 * a link swapped in later changes nothing, and a folder already named isn't
 * added twice. Halonic's profile folder is never a workspace, as at start.
 *
 * @param profileFolder - the profile folder the host serves, which is refused
 */
export function addOpenedWorkspace(
  workspaceRoots: string[],
  folder: string,
  profileFolder: string | undefined,
): OpenedWorkspace {
  const real = realPathOf(folder);
  if (real === undefined) return { refused: "missing" };
  if (statSync(real, { throwIfNoEntry: false })?.isDirectory() !== true) {
    return { refused: "not_a_folder" };
  }
  const profile = profileFolder === undefined ? undefined : realPathOf(profileFolder);
  if (real === profile) return { refused: "profile_folder" };
  if (!workspaceRoots.includes(real)) workspaceRoots.push(real);
  return { added: real };
}

const refusalText: Record<OpenedWorkspaceRefusal, string> = {
  missing: "it doesn't exist or can't be read",
  not_a_folder: "it isn't a folder",
  profile_folder: "it is Halonic's profile folder",
};

/**
 * Names `folder` with {@link addOpenedWorkspace} and writes a refusal to
 * `log`, so it is reported rather than dropped: Studio's shell keeps the
 * host's standard error in its log. The line names why, never the folder.
 */
export function openWorkspaceReporting(
  workspaceRoots: string[],
  folder: string,
  profileFolder: string | undefined,
  log: (text: string) => void,
): OpenedWorkspace {
  const opened = addOpenedWorkspace(workspaceRoots, folder, profileFolder);
  if ("refused" in opened) {
    log(`A folder Studio opened can't be a workspace here: ${refusalText[opened.refused]}.\n`);
  }
  return opened;
}

/** The real path of `path`, or `undefined` when it doesn't exist or can't be read. */
function realPathOf(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}
