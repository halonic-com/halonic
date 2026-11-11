import { basename, relative, resolve } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { KindedError } from "@halonicjs/std";
import {
  copyWorkspace,
  filesOf,
  type InitializedWorkspace,
  initWorkspace,
  loadWorkspace,
} from "@halonicjs/workspace";
import {
  type CliCommand,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { type ExampleContents, initMessages } from "../../messages/init.ts";
import { markPart, type Phrase, phrase, plainText } from "../../messages/phrase.ts";
import { nearMatch } from "../../near-match.ts";
import { type NextStep, nextSteps } from "../../output/next-steps.ts";
import { printable } from "../../output/printable.ts";
import { shellWord } from "../../output/shell-word.ts";
import { shownPath } from "../../shown-path.ts";
import { writeFailure } from "../../write-failure.ts";
import { type InitExample, initExamples } from "./examples.ts";

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
 * `halonic init [folder] [--example acme]`: lays out a new, empty workspace
 * in a new folder, or in the current one when it's empty; with `--example`,
 * a copy of that example instead, in `./acme` when no folder is named
 * (cli-output 3.1). It never writes into a folder that has files in it.
 */
export const initCommand: CliCommand = {
  name: "init",
  usage: `[folder] [--example ${Object.keys(initExamples).join("|")}]`,
  summary: initMessages.summary(),
  action: (input, context) => {
    const folder = initFolder(input, context.cwd, defaultFolder(input));
    return folder.root === resolve(context.cwd)
      ? initMessages.actionHere()
      : initMessages.action(printable(folder.shown));
  },
  options: {
    example: { type: "string", valueName: "name", description: initMessages.exampleOption() },
  },
  async run(input, context) {
    if (input.positionals.length > 1) {
      throw new UsageError(initMessages.tooManyFolders(input.positionals.map(printable)));
    }
    const exampleName = input.options["example"];
    if (typeof exampleName === "string") {
      return await copyExample(knownExample(exampleName), input, context.cwd);
    }
    return await createEmpty(initFolder(input, context.cwd, "."), context.cwd);
  },
};

/** `halonic init [folder]`: a new, empty workspace named after its folder. */
async function createEmpty(folder: InitFolder, cwd: string): Promise<CommandResult> {
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
    lines: createdLines(result.value, folder, cwd),
    json: {
      workspace: { name: result.value.name, folder: folder.shown },
      example: null,
      created: result.value.files,
      // A new, empty workspace has none of these yet; an example's copy counts its own.
      counts: { hubs: 0, agents: 0, workflows: 0, routines: 0 },
    },
  };
}

/**
 * `halonic init [folder] --example acme`: a copy of the example, in the
 * folder named or else in the first of `./acme`, `./acme-2`, … that is empty
 * or missing, so a second copy never overwrites the first.
 */
async function copyExample(
  example: InitExample,
  input: CommandInput,
  cwd: string,
): Promise<CommandResult> {
  const named = input.positionals.length > 0;
  const folder = named ? initFolder(input, cwd, ".") : await freeExampleFolder(example, cwd);
  const store = new FolderDefinitionStore(folder.root, folder.shown);
  const source = new FolderDefinitionStore(example.folder);
  const result = await copyWorkspace(source, store).catch((error: unknown) => {
    throw writeFailure(error);
  });
  if (!result.ok) {
    throw new FolderNotEmptyError();
  }

  const copy = await loadWorkspace(store);
  const contents: ExampleContents = {
    hubs: filesOf(copy, "hub").length,
    agents: filesOf(copy, "agent").length,
    workflows: filesOf(copy, "workflow").length,
    routines: filesOf(copy, "routine").length,
  };
  const firstChoice = shownPath(cwd, resolve(cwd, example.name));
  const beside = !named && folder.shown !== firstChoice ? firstChoice : undefined;
  return {
    exitCode: exitCode.ok,
    lines: exampleLines(example, folder, contents, beside, cwd),
    json: {
      workspace: {
        name: filesOf(copy, "workspace")[0]?.value.name ?? folder.name,
        folder: folder.shown,
      },
      example: example.name,
      created: result.value.files,
      counts: contents,
    },
  };
}

/** The example by its name, or a usage error naming the ones there are. */
function knownExample(name: string): InitExample {
  const example = initExamples[name];
  if (example !== undefined) {
    return example;
  }
  const names = Object.keys(initExamples);
  const near = nearMatch(name, names);
  const problem =
    near === undefined
      ? initMessages.unknownExample(printable(name))
      : initMessages.unknownExampleNear(printable(name), near);
  throw new UsageError(problem, initMessages.examples(names));
}

/** The first of `./acme`, `./acme-2`, `./acme-3`, … that is missing or empty. */
async function freeExampleFolder(example: InitExample, cwd: string): Promise<InitFolder> {
  for (let number = 1; ; number += 1) {
    const name = number === 1 ? example.name : `${example.name}-${number}`;
    const root = resolve(cwd, name);
    if ((await new FolderDefinitionStore(root).list()).length === 0) {
      return { root, shown: shownPath(cwd, root), name };
    }
  }
}

/**
 * The folder a workspace goes in when none is named: the example's name with
 * `--example`, so "Couldn't create the workspace in ./acme" names the first
 * choice, else the current folder.
 */
function defaultFolder(input: CommandInput): string {
  const example = input.options["example"];
  return typeof example === "string" && initExamples[example] !== undefined ? example : ".";
}

/** The folder the user named, resolved from here; the default folder without one. */
function initFolder(input: CommandInput, cwd: string, fallback: string): InitFolder {
  const root = resolve(cwd, input.positionals[0] ?? fallback);
  // The root of a drive has no name of its own; any id is better than none.
  return { root, shown: shownPath(cwd, root), name: basename(root) || "workspace" };
}

/** The ✓ line, then the `Next:` block: `cd` when the workspace is elsewhere, `validate`, the first-agent guide. */
function createdLines(workspace: InitializedWorkspace, folder: InitFolder, cwd: string): Phrase[] {
  const name = printable(workspace.name);
  const here = isHere(folder, cwd);
  const created = here
    ? initMessages.createdHere(name)
    : initMessages.created(name, printable(folder.shown));
  const validate = {
    command: initMessages.nextValidate().phrase,
    why: initMessages.nextValidateWhy().phrase,
  };
  return [
    phrase`${markPart("done")} ${created.phrase}`,
    ...nextSteps([...changeFolder(folder, cwd), validate], initMessages.nextFirstAgent().phrase),
  ];
}

/**
 * The ✓ line and the example's contents under it, then the `Next:` block:
 * `cd`, `halonic test`, then `halonic run` on the example's input.
 *
 * @param beside - the folder that was already there, when the copy went next to it
 */
function exampleLines(
  example: InitExample,
  folder: InitFolder,
  contents: ExampleContents,
  beside: string | undefined,
  cwd: string,
): Phrase[] {
  const shown = printable(folder.shown);
  const created =
    beside === undefined
      ? initMessages.createdExample(shown)
      : initMessages.createdExampleBeside(shown, printable(beside));
  const test = { command: initMessages.nextTest().phrase, why: initMessages.nextTestWhy().phrase };
  const run = {
    command: initMessages.nextRun(example.workflow.id, example.workflow.input).phrase,
  };
  return [
    phrase`${markPart("done")} ${created.phrase}`,
    phrase`  ${initMessages.exampleContents(contents).phrase}`,
    ...nextSteps([...changeFolder(folder, cwd), test, run]),
  ];
}

/** Whether the workspace is in the folder the user is in. */
function isHere(folder: InitFolder, cwd: string): boolean {
  return folder.root === resolve(cwd);
}

/** The `cd` that starts the `Next:` block, when the workspace is in another folder. */
function changeFolder(folder: InitFolder, cwd: string): NextStep[] {
  return isHere(folder, cwd)
    ? []
    : [{ command: initMessages.nextChangeFolder(shellWord(relative(cwd, folder.root))).phrase }];
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
