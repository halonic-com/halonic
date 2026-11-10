import { counted, countInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { bold, dim, markPart, type Phrase, phrase } from "./phrase.ts";

/** What the Acme example holds, for the line under "Created a copy of the Acme example". */
export interface ExampleContents {
  readonly hubs: number;
  readonly agents: number;
  readonly workflows: number;
  readonly routines: number;
}

/**
 * The sentences of `halonic init [folder] [--example acme]` (cli-output 1.9
 * and 3.1). The ✓ and ✕ marks, the `Next:` block's columns and the indent
 * are the printer's; these are the words.
 */
export const initMessages = defineMessages("init", {
  summary: () => phrase`Create a workspace, or a copy of the Acme example`,
  /** What `init` was doing, for "✕ Couldn't create the workspace in ./acme: …". */
  action: (folder: string) => phrase`create the workspace in ${folder}`,
  /** `init` with no folder, in the folder the user is in, where a path would only be ".". */
  actionHere: () => phrase`create the workspace in this folder`,

  created: (name: string, folder: string) =>
    phrase`Created the workspace ${name} in ${bold(folder)}.`,
  /** `init` with no folder, in the empty folder the user is in, where a path would only be ".". */
  createdHere: (name: string) => phrase`Created the workspace ${name} in ${bold("this folder")}.`,
  createdExample: (folder: string) =>
    phrase`Created a copy of the Acme example in ${bold(folder)}.`,
  /** A second copy never overwrites: "… in ./acme-2. ./acme was already there." */
  createdExampleBeside: (folder: string, existing: string) =>
    phrase`Created a copy of the Acme example in ${bold(folder)}. ${existing} was already there.`,
  /** The dimmed line under the example's ✓ line. */
  exampleContents: (contents: ExampleContents) => contentsLine(contents),

  nextHeading: () => phrase`Next:`,
  /** The `cd` that comes first in `Next:` when the workspace is in a new folder. */
  nextChangeFolder: (folder: string) => phrase`cd ${folder}`,
  nextValidate: () => phrase`halonic validate`,
  nextValidateWhy: () => [dim("check the files as you edit them")],
  nextTest: () => phrase`halonic test`,
  nextTestWhy: () => [dim("run its workflow tests (no key, nothing sent)")],
  /** "halonic run support-reply --input examples/refund-question.json", the example's own workflow and input. */
  nextRun: (workflow: string, input: string) => phrase`halonic run ${workflow} --input ${input}`,
  /** Studio as a choice, not pushed (1.6): the last `Next:` line, dimmed as the preview shows it. */
  nextStudio: () => [dim("Or open the folder in Studio to add your first agent.")],
  /** The example's last `Next:` line, with the title of the workflow to start, such as "Support reply". */
  nextStudioExample: (workflowTitle: string) => [
    dim(`Or open the folder in Studio and start ${workflowTitle} from the Inbox.`),
  ],

  /** The reason when the folder has files in it (`conflict`, exit 5). */
  notEmpty: () => phrase`the folder isn't empty.`,
  notEmptyFix: () => phrase`Pick a new folder name, or run it in an empty folder.`,
  unknownExample: (name: string) => phrase`There's no example called "${name}".`,
  unknownExampleNear: (name: string, near: string) =>
    phrase`There's no example called "${name}". Did you mean ${near}?`,
  /** The fix line after an unknown example: the ones there are. */
  examples: (names: readonly string[]) => phrase`Examples: ${names.join(", ")}`,
  tooManyFolders: (folders: readonly string[]) =>
    phrase`halonic init takes one folder name, and you gave ${countInWords(folders.length)}: ${folders.join(", ")}.`,
});

/**
 * "2 hubs · 3 agents · 2 workflows · 1 routine · runs on the test model, no key
 * needed", all dimmed, with the separator as a mark so it falls back to `-`
 * where the output isn't UTF-8.
 */
function contentsLine(contents: ExampleContents): Phrase {
  const facts = [
    counted(contents.hubs, "hub", "hubs"),
    counted(contents.agents, "agent", "agents"),
    counted(contents.workflows, "workflow", "workflows"),
    counted(contents.routines, "routine", "routines"),
    "runs on the test model, no key needed",
  ];
  return facts.flatMap((fact, index) =>
    index === 0 ? [dim(fact)] : [" ", markPart("separator"), " ", dim(fact)],
  );
}
