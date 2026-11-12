// `halonic tools review <source>` (cli-output 3.10): shows each waiting
// tool and asks about it, approving exactly the fingerprint shown above the
// question (HAL-2579 F9). Without a terminal it shows the same blocks, asks
// nothing and says how to approve from a script.

import {
  approveWaitingTool,
  type ListedToolApprovalCheck,
  type ListedToolReview,
  type ReviewedTool,
  reviewListedTools,
} from "@halonicjs/app";
import type {
  CommandContext,
  CommandInput,
  CommandResult,
  JsonFields,
  StoppedResult,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { dimmed, markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { printable } from "../../output/printable.ts";
import { toolBlock } from "./blocks.ts";
import { reviewDocument } from "./json.ts";
import {
  checkToolSource,
  openToolSource,
  type ToolSource,
  type ToolsMachine,
  toolsCommand,
} from "./source.ts";

/** Thrown by a question where nobody can answer it: the review goes on without asking. */
class NobodyToAsk extends Error {
  override readonly name = "NobodyToAsk";
}

/**
 * Reviews the source's waiting tools. Every line is printed as it comes, so
 * each question stands right under the tool it asks about.
 */
export async function reviewTools(
  input: CommandInput,
  context: CommandContext,
  machine: ToolsMachine,
): Promise<CommandResult | StoppedResult> {
  const source = await openToolSource(input, context, "review");
  const check = await checkToolSource(source, machine, context);
  if (check === "built_in") {
    return done([toolsMessages.onlyBuiltIn(source.shown).phrase], { source: source.connector.id });
  }
  const review = reviewListedTools(check);
  const json = reviewDocument(review);
  const shownTools = review.toReview.length + review.refused.length + review.keepsChanging.length;
  if (shownTools === 0) {
    return done([lastLine(review, source, [])], json);
  }

  const shown = new ShownLines(context);
  shown.show([
    toolsMessages.title(source.shown).phrase,
    toolsMessages.topLine().phrase,
    toolsMessages.topLineAdvice().phrase,
  ]);
  const asked = await askEachTool(review.toReview, { check, source, context, machine, shown });
  if (asked.stopped) {
    return stoppedAfter(source, asked.approved, json);
  }
  shown.show(refusedLines(review));
  shown.show(review.keepsChanging.flatMap((reviewed) => keepsChangingBlock(reviewed, source)));

  if (!asked.couldAsk && review.toReview.length > 0) {
    return {
      // Not 0, so a script or CI sees that tools stay off (cli-output 3.10, B.2).
      exitCode: exitCode.failed,
      lines: shown.lines,
      json,
      warnings: noTerminalLines(review.toReview.length, source),
    };
  }
  return done([...shown.lines, [], lastLine(review, source, asked.approved)], json);
}

/** The result lines printed so far, each printed as it is added. */
class ShownLines {
  readonly lines: Phrase[] = [];
  readonly #context: CommandContext;

  constructor(context: CommandContext) {
    this.#context = context;
  }

  show(lines: readonly Phrase[]): void {
    for (const line of lines) {
      this.#context.printAhead(line);
      this.lines.push(line);
    }
  }
}

/** What {@link askEachTool} works with. */
interface Asking {
  readonly check: ListedToolApprovalCheck;
  readonly source: ToolSource;
  readonly context: CommandContext;
  readonly machine: ToolsMachine;
  readonly shown: ShownLines;
}

/** What the person answered. */
interface Asked {
  /** The tools approved, by their printable names, in the order asked. */
  readonly approved: string[];
  /** `false` when nobody could be asked: the blocks were shown without questions. */
  readonly couldAsk: boolean;
  /** `true` when Ctrl C or SIGTERM ended a question. */
  readonly stopped: boolean;
}

/**
 * Shows each waiting tool and asks about it right under its block,
 * approving the fingerprint shown when the answer is yes. Where nobody can
 * answer, the first question says so, and the rest are shown without asking.
 */
async function askEachTool(toReview: readonly ReviewedTool[], asking: Asking): Promise<Asked> {
  const { check, source, context, machine, shown } = asking;
  const approved: string[] = [];
  let couldAsk = true;
  for (const reviewed of toReview) {
    shown.show([[], ...toolBlock(reviewed, source)]);
    if (!couldAsk) {
      continue;
    }
    const answer = await askAbout(reviewed, context);
    if (answer === "stopped") {
      return { approved, couldAsk, stopped: true };
    }
    if (answer === "nobody") {
      couldAsk = false;
    } else if (answer) {
      await approveWaitingTool(check, reviewed.waiting, machine.approvals, machine.clock);
      approved.push(printable(reviewed.waiting.listedName));
    }
  }
  return { approved, couldAsk, stopped: false };
}

/**
 * Asks about one waiting tool, under its block: the answer, or `nobody`
 * where nobody can answer, or `stopped` after Ctrl C.
 */
async function askAbout(
  reviewed: ReviewedTool,
  context: CommandContext,
): Promise<boolean | "nobody" | "stopped"> {
  const name = printable(reviewed.waiting.listedName);
  const question = {
    question:
      reviewed.state === "changed"
        ? toolsMessages.askChanged(name)
        : toolsMessages.askNotApproved(name),
    yes: false,
    refusal: () => new NobodyToAsk(),
  };
  try {
    return await context.ask(question);
  } catch (error) {
    if (context.signal.aborted) {
      return "stopped";
    }
    if (error instanceof NobodyToAsk) {
      return "nobody";
    }
    throw error;
  }
}

/** "Refused, can't be approved", then each refused tool and why, lined up. */
function refusedLines(review: ListedToolReview): Phrase[] {
  if (review.refused.length === 0) {
    return [];
  }
  const rows = review.refused.map((refused) => [
    phrase`  ${printable(refused.name)}`,
    phrase`${printable(refused.reason)}`,
  ]);
  return [[], toolsMessages.refusedHeading().phrase, ...columns(rows)];
}

/** A tool its server keeps changing: its block, then why it isn't asked about, and how to approve it on purpose. */
function keepsChangingBlock(reviewed: ReviewedTool, source: ToolSource): Phrase[] {
  const name = printable(reviewed.waiting.listedName);
  const command = toolsCommand(
    "approve",
    source,
    `${name} --fingerprint ${reviewed.waiting.fingerprint}`,
  );
  return [
    [],
    ...toolBlock(reviewed, source),
    phrase`${markPart("needsYou")} ${toolsMessages.keepsChangingLine(source.shown, name).phrase}`,
    phrase`  ${toolsMessages.approveOnPurpose(command).phrase}`,
  ];
}

/** The review's last line, with how many tools are on, dimmed, when any are. */
function lastLine(
  review: ListedToolReview,
  source: ToolSource,
  approved: readonly string[],
): Phrase {
  const on = review.on.length + approved.length;
  const onCount = on === 0 ? [] : phrase` ${dimmed(toolsMessages.toolsOn(on).phrase)}`;
  return phrase`${outcomeLine(review, source, approved)}${onCount}`;
}

function outcomeLine(
  review: ListedToolReview,
  source: ToolSource,
  approved: readonly string[],
): Phrase {
  if (review.toReview.length === 0) {
    return phrase`${markPart("done")} ${toolsMessages.nothingWaiting(source.shown).phrase}`;
  }
  const off = review.toReview
    .map((reviewed) => printable(reviewed.waiting.listedName))
    .filter((name) => !approved.includes(name));
  if (approved.length === 0) {
    return phrase`${markPart("needsYou")} ${toolsMessages.approvedNothing(source.shown, off).phrase}`;
  }
  const said =
    off.length === 0
      ? toolsMessages.approvedAllAsked(approved.length, source.shown)
      : toolsMessages.approvedSomeOff(approved.length, source.shown, off);
  return phrase`${markPart("done")} ${said.phrase}`;
}

/** What stays off when nobody could be asked, and the command that approves from a script. */
function noTerminalLines(waiting: number, source: ToolSource): Phrase[] {
  const command = toolsCommand("approve", source, "<tool> --fingerprint <fingerprint>");
  return [
    phrase`${markPart("needsYou")} ${toolsMessages.noTerminal(waiting, source.shown).phrase}`,
    phrase`  ${toolsMessages.noTerminalFix(command).phrase}`,
  ];
}

/** Ctrl C during a question (N8): the tools answered yes before it stay approved, and that's said. */
function stoppedAfter(
  source: ToolSource,
  approved: readonly string[],
  json: JsonFields,
): StoppedResult {
  if (approved.length === 0) {
    return { stopped: true, json };
  }
  return {
    stopped: true,
    meaning: toolsMessages.stoppedAfter(source.shown, approved).phrase,
    json: { ...json, approved },
  };
}

function done(lines: readonly Phrase[], json: JsonFields): CommandResult {
  return { exitCode: exitCode.ok, lines, json };
}
