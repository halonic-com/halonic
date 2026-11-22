import { access, constants, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { DefinitionStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { isUnreadable, settingsPath } from "@halonicjs/workspace";
import type { CliOption, CommandContext, CommandInput } from "./command.ts";
import { plainText } from "./messages/phrase.ts";
import { workspaceMessages } from "./messages/workspace.ts";
import { checkProfilePlace } from "./profile-place.ts";
import { shownPath } from "./shown-path.ts";
import { workspaceStore } from "./workspace-store.ts";

/**
 * `--dir <folder>`, the one option for the workspace folder (cli-output
 * section 3, "Which folder"). Every command that reads a workspace lists it
 * under this name; only `init [folder]` takes its folder as an argument.
 */
export const dirOption: CliOption = {
  type: "string",
  valueName: "folder",
  description: workspaceMessages.dirOption(),
};

/** The workspace folder a command was pointed at. */
export interface WorkspaceDir {
  /** The full path, for the file system. */
  readonly root: string;
  /** The folder as the user would type it, such as `./acme` or `.`, for the words. */
  readonly shown: string;
  /** The folder's own name, as a sentence names the workspace: "No runs in acme yet." */
  readonly name: string;
}

/** An opened workspace folder: where it is, and its files. */
export interface OpenWorkspaceDir extends WorkspaceDir {
  /** The workspace's files, to hand to `loadWorkspace` or a service. */
  readonly store: DefinitionStore;
}

/**
 * The folder the command works in: `--dir <folder>` when it was given,
 * resolved from the current folder, else the current folder itself. It never
 * looks in a parent folder, so a command can't pick up a workspace the user
 * didn't point at. It reads nothing; {@link openWorkspaceDir} does.
 *
 * @example
 * workspaceDir({ positionals: [], options: { dir: "acme" } }, "<cwd>");
 * // { root: "<cwd>/acme", shown: "./acme", name: "acme" }
 */
export function workspaceDir(input: CommandInput, cwd: string): WorkspaceDir {
  const dir = input.options["dir"];
  const root = typeof dir === "string" ? resolve(cwd, dir) : cwd;
  return { root, shown: shownPath(cwd, root), name: basename(root) };
}

/**
 * Finds the workspace the command was pointed at (see {@link workspaceDir})
 * and opens its files, with the profile fenced off. A workspace that holds a
 * moved profile folder, or lies inside the profile, is refused before
 * anything in it is read (HAL-15201); a folder without `workspace.yaml` is
 * no workspace, so it gets "no workspace" whatever the profile's place.
 *
 * @throws NoWorkspaceError when the folder has no `workspace.yaml`, or doesn't exist.
 * @throws KindedError `invalid_input` when the folder, or its `workspace.yaml`, can't be read.
 * @throws ProfilePlaceError when the workspace and the profile overlap.
 */
export async function openWorkspaceDir(
  input: CommandInput,
  context: Pick<CommandContext, "cwd">,
): Promise<OpenWorkspaceDir> {
  const dir = workspaceDir(input, context.cwd);
  if (!(await holdsWorkspaceFile(dir.root))) throw new NoWorkspaceError();
  await checkProfilePlace(dir.root);
  const store = workspaceStore(dir.root, dir.shown);
  if ((await readSettings(store, dir.root)) === null) {
    throw new NoWorkspaceError();
  }
  return { ...dir, store };
}

/**
 * Whether `root` has a `workspace.yaml`, by a plain look at the folder: the
 * workspace's store isn't opened yet, since it is fenced from the profile
 * and the profile check comes first. A folder this account can't read counts
 * as holding one, so opening it says what can't be read.
 *
 * @param root - the folder a command was pointed at
 */
export async function holdsWorkspaceFile(root: string): Promise<boolean> {
  try {
    await stat(join(root, settingsPath));
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code !== "ENOENT" && code !== "ENOTDIR";
  }
}

/**
 * The text of `workspace.yaml`, or `null` when there is none. A folder or file
 * the account may not read (`EACCES`, or `EPERM` on Windows) is the user's to
 * fix, so it becomes an `invalid_input` error that names which of the two, not
 * a crash.
 */
async function readSettings(store: DefinitionStore, root: string): Promise<string | null> {
  try {
    return await store.read(settingsPath);
  } catch (error) {
    if (!isUnreadable(error)) {
      throw error;
    }
    const folderReads = await access(root, constants.R_OK | constants.X_OK).then(
      () => true,
      () => false,
    );
    throw folderReads
      ? new KindedError(
          "invalid_input",
          plainText(workspaceMessages.fileUnreadable(settingsPath).phrase),
          { fix: plainText(workspaceMessages.fileUnreadableFix().phrase), cause: error },
        )
      : new KindedError("invalid_input", plainText(workspaceMessages.folderUnreadable().phrase), {
          fix: plainText(workspaceMessages.folderUnreadableFix().phrase),
          cause: error,
        });
  }
}

/**
 * The folder as a suggested command repeats it: the user's own `--dir`, as
 * typed relative to here, or `undefined` without one, so the suggestion
 * stays as short as what the user typed.
 *
 * @example
 * givenDir({ positionals: [], options: { dir: "acme" } }, workspace); // "./acme"
 * givenDir({ positionals: [], options: {} }, workspace); // undefined
 */
export function givenDir(input: CommandInput, workspace: WorkspaceDir): string | undefined {
  return typeof input.options["dir"] === "string" ? workspace.shown : undefined;
}

/**
 * The folder a command was pointed at holds no workspace: `not_found`, so
 * exit 4. Its message is the reason and its fix the next step; the command's
 * own action makes line 1, as in "✕ Couldn't check ./downloads: there's no
 * workspace.yaml here.".
 */
export class NoWorkspaceError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code = "no-workspace";

  constructor() {
    super("not_found", plainText(workspaceMessages.noWorkspace().phrase), {
      fix: plainText(workspaceMessages.noWorkspaceFix().phrase),
    });
  }
}
