import { basename, resolve } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { DefinitionStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { settingsPath } from "@halonicjs/workspace";
import type { CliOption, CommandContext, CommandInput } from "./command.ts";
import { plainText } from "./messages/phrase.ts";
import { workspaceMessages } from "./messages/workspace.ts";
import { shownPath } from "./shown-path.ts";

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
 * and opens its files.
 *
 * @throws NoWorkspaceError when the folder has no `workspace.yaml`, or doesn't exist.
 */
export async function openWorkspaceDir(
  input: CommandInput,
  context: Pick<CommandContext, "cwd">,
): Promise<OpenWorkspaceDir> {
  const dir = workspaceDir(input, context.cwd);
  const store = new FolderDefinitionStore(dir.root, dir.shown);
  if ((await store.read(settingsPath)) === null) {
    throw new NoWorkspaceError();
  }
  return { ...dir, store };
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
