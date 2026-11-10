import { basename, relative, resolve } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { KindedError } from "@halonicjs/std";
import { type InitializedWorkspace, initWorkspace } from "@halonicjs/workspace";
import { type CliCommand, type CommandInput, UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { initMessages } from "../../messages/init.ts";
import { markPart, type Phrase, phrase, plainText } from "../../messages/phrase.ts";
import { nextSteps } from "../../output/next-steps.ts";
import { printable } from "../../output/printable.ts";
import { shownPath } from "../../shown-path.ts";
import { writeFailure } from "../../write-failure.ts";

/** The folder `init` lays the workspace out in, as the file system and the user each see it. */
interface InitFolder {
  /** The full path. */
  readonly root: string;
  /** As the user would type it from here: `./acme`, or `.` for the current folder. */
  readonly shown: string;
  /** The folder's own name, which names the workspace and makes its id. */
  readonly name: string;
}

/**
 * `halonic init [folder]`: lays out a new, empty workspace in a new folder, or
 * in the current one when it's empty (cli-output 3.1). It never writes into
 * a folder that has files in it.
 */
export const initCommand: CliCommand = {
  name: "init",
  usage: "[folder]",
  summary: initMessages.summary(),
  action: (input, context) => {
    const folder = initFolder(input, context.cwd);
    return folder.root === resolve(context.cwd)
      ? initMessages.actionHere()
      : initMessages.action(printable(folder.shown));
  },
  options: {},
  async run(input, context) {
    if (input.positionals.length > 1) {
      throw new UsageError(initMessages.tooManyFolders(input.positionals.map(printable)));
    }
    const folder = initFolder(input, context.cwd);
    const store = new FolderDefinitionStore(folder.root, folder.shown);
    const result = await initWorkspace(store, { name: folder.name }).catch((error: unknown) => {
      throw writeFailure(error);
    });
    if (!result.ok) {
      if (result.error.kind === "not_empty") {
        throw new FolderNotEmptyError();
      }
      // The id comes from slugify, which always gives an allowed one, so this is a bug; the
      // CLI shows it as one, with the schema's own problems under --debug.
      throw new Error(result.error.problems.map((problem) => problem.message).join("; "));
    }
    return {
      exitCode: exitCode.ok,
      lines: createdLines(result.value, folder, context.cwd),
      json: {
        workspace: { name: result.value.name, folder: folder.shown },
        example: null,
        created: result.value.files,
        // A new, empty workspace has none of these yet; an example's copy will count its own.
        counts: { hubs: 0, agents: 0, workflows: 0, routines: 0 },
      },
    };
  },
};

/** The folder the user named, resolved from here; the current folder without one. */
function initFolder(input: CommandInput, cwd: string): InitFolder {
  const root = resolve(cwd, input.positionals[0] ?? ".");
  // The root of a drive has no name of its own; any id is better than none.
  return { root, shown: shownPath(cwd, root), name: basename(root) || "workspace" };
}

/** The ✓ line, then the `Next:` block: `cd` when the workspace is elsewhere, `validate`, Studio. */
function createdLines(workspace: InitializedWorkspace, folder: InitFolder, cwd: string): Phrase[] {
  const name = printable(workspace.name);
  const here = folder.root === resolve(cwd);
  const created = here
    ? initMessages.createdHere(name)
    : initMessages.created(name, printable(folder.shown));
  const changeFolder = here
    ? []
    : [{ command: initMessages.nextChangeFolder(shellWord(relative(cwd, folder.root))).phrase }];
  const validate = {
    command: initMessages.nextValidate().phrase,
    why: initMessages.nextValidateWhy().phrase,
  };
  return [
    phrase`${markPart("done")} ${created.phrase}`,
    ...nextSteps([...changeFolder, validate], initMessages.nextStudio().phrase),
  ];
}

/**
 * The path as one word a shell reads back as it is: in double quotes when it
 * holds a space or a character a shell would read, so `cd "my agents"` can
 * be copied and run.
 */
function shellWord(path: string): string {
  const shown = printable(path);
  return /^[\w./\\:-]+$/u.test(shown) ? shown : `"${shown}"`;
}

/**
 * The folder already has files in it: `conflict`, so exit 5. Its message is
 * the reason and its fix the next step; the command's own action makes line 1:
 * "✕ Couldn't create the workspace in ./acme: the folder isn't empty.".
 */
export class FolderNotEmptyError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code = "folder-not-empty";

  constructor() {
    super("conflict", plainText(initMessages.notEmpty().phrase), {
      fix: plainText(initMessages.notEmptyFix().phrase),
    });
  }
}
