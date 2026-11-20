// Turns the `DoctorService`'s report into the lines `halonic doctor` prints
// (cli-output 3.7): the heading, one line per check with its mark and label,
// the reasons and fixes under it, then the summary. Which sentences a line
// says comes from `doctorLineWords` in `@halonicjs/words`, the same as
// Studio's; this file lays them out, and words the Sandbox line, whose
// reason and fix are the CLI's own.

import type {
  DoctorReport,
  DoctorStatus,
  NodeLine,
  SandboxLine,
  TimedOutLine,
} from "@halonicjs/app";
import type { SignInShell } from "@halonicjs/ports";
import {
  type DoctorFace,
  type DoctorLineItem,
  type DoctorLineWords,
  doctorLineWords,
  timedOutWords,
  type WordedLine,
} from "@halonicjs/words";
import type { Message } from "../messages/define.ts";
import { doctorMessages } from "../messages/doctor.ts";
import { errorMessages } from "../messages/general.ts";
import { markPart, type Phrase, phrase, plainText } from "../messages/phrase.ts";
import {
  readsAsOther,
  sandboxDocsLink,
  sandboxMessages,
  windowsNodeInWsl,
} from "../messages/sandbox.ts";
import { suggestedCommand } from "../messages/suggested-command.ts";
import type { Mark } from "./paint.ts";
import { withoutUnsafe } from "./printable.ts";
import { shellWord } from "./shell-word.ts";

/** What the report doesn't hold, because only the host knows it. */
export interface DoctorFacts {
  /** Halonic's version, such as "0.1.0". */
  readonly version: string;
  /** The operating system and processor, such as "Linux x64". */
  readonly system: string;
  /** The kind of sandbox on the ✓ line, such as "bubblewrap". */
  readonly sandboxKind: string;
  /** The `--dir` the user gave, so the suggested `halonic trust` keeps it. */
  readonly dir?: string;
  /** The WSL distro `doctor` runs in, for the WSL 1 fix's command. */
  readonly wslDistro?: string;
  /** The terminal the person types a harness's sign-in into: PowerShell on Windows, `sh` elsewhere. */
  readonly signInShell: SignInShell;
}

/** The labels' column: the longest label, "Workspace" or "Harnesses", and three spaces. */
const labelWidth = 12;

/** Where the lines under a check start: under its first word, past the mark and the label. */
const indent = " ".repeat(2 + labelWidth);

/** The mark at the start of a check's line, by its status. */
const marks: Readonly<Record<DoctorStatus, Mark>> = {
  ok: "done",
  warning: "needsYou",
  failed: "failed",
};

/**
 * One check: what follows the label on its first line, then the lines under
 * it. A check whose first sentence is a problem puts that problem on the
 * first line, as "! Models      smart needs an API key for Anthropic.".
 */
interface CheckLines {
  readonly status: DoctorStatus;
  readonly label: Message;
  readonly lines: readonly Phrase[];
}

/**
 * The lines of `halonic doctor`, in the order of cli-output 3.7: Workspace,
 * Models, Secrets (HAL-14269), Sandbox, Harnesses, Node.js (HAL-6517), Network (HAL-14262)
 * and Disk, each only when the report has it, with an empty line after the heading and before
 * the summary.
 *
 * @example
 * doctorReportLines(report, { version: "0.1.0", system: "Linux x64", sandboxKind: "bubblewrap" });
 * // ["Halonic 0.1.0 · Linux x64", "", "✓ Workspace   acme · trusted on this computer", …,
 * //  "", "No problems."] (as phrases)
 */
export function doctorReportLines(report: DoctorReport, facts: DoctorFacts): Phrase[] {
  const node = report.node === undefined || isTimedOut(report.node) ? undefined : report.node;
  const face: DoctorFace = {
    trustCommand: suggestedCommand("trust", facts.dir),
    validateCommand: suggestedCommand("validate", facts.dir),
    signInShell: facts.signInShell,
    shellWord: (text) => shellWord(text),
  };
  const worded = (line: WordedLine | undefined) =>
    line && checkOf(line.status, doctorLineWords(line, face));
  const sandbox = isTimedOut(report.sandbox)
    ? checkOf(report.sandbox.status, timedOutWords("sandbox"))
    : sandboxCheck(report.sandbox, facts, node);
  const checks = [
    worded(report.workspace),
    worded(report.models),
    worded(report.secrets),
    sandbox,
    worded(report.harnesses),
    worded(report.node),
    worded(report.network),
    worded(report.disk),
  ].filter((check) => check !== undefined);
  return [
    doctorMessages.heading(facts.version, facts.system).phrase,
    [],
    ...checks.flatMap(checkLines),
    [],
    summaryLine(report),
  ];
}

function isTimedOut<Line extends object>(line: Line | TimedOutLine): line is TimedOutLine {
  return "timedOut" in line;
}

/** A line's words as the CLI prints them: a docs link as `More:`. */
function checkOf(status: DoctorStatus, { label, items }: DoctorLineWords): CheckLines {
  return { status, label, lines: items.map(itemPhrase) };
}

function itemPhrase(item: DoctorLineItem): Phrase {
  if ("docs" in item) return errorMessages.more(item.docs).phrase;
  return "fix" in item ? item.fix : item.sentence;
}

/** The mark and the label in their column, then the first line; the rest indented under it. */
function checkLines({ status, label, lines }: CheckLines): Phrase[] {
  const [first = [], ...under] = lines;
  const labelText = plainText(label.phrase).padEnd(labelWidth);
  return [
    phrase`${markPart(marks[status])} ${labelText}${first}`,
    ...under.map((line) => phrase`${indent}${line}`),
  ];
}

/**
 * ✓ with the kind of sandbox, or ✕ with the reason, the fix and `More:` by
 * the reason's code. With Windows' Node.js in a WSL folder, the code is
 * `windows-node-in-wsl` whatever the sandbox's own reason, as for a refused
 * `run`, because the fix is Node.js inside WSL (HAL-6552).
 */
function sandboxCheck(
  line: SandboxLine,
  facts: DoctorFacts,
  node: NodeLine | undefined,
): CheckLines {
  const label = doctorMessages.sandboxLabel();
  if (line.status === "ok") {
    return {
      status: line.status,
      label,
      lines: [doctorMessages.sandboxReady(facts.sandboxKind).phrase],
    };
  }
  const code = node?.problem === "windows-node-in-wsl" ? windowsNodeInWsl : line.reason;
  return {
    status: line.status,
    label,
    lines: [
      doctorMessages.sandboxCantStart().phrase,
      sandboxReason(code, line.missing).phrase,
      sandboxMessages.doctorFix(code, { distro: facts.wslDistro, missing: line.missing }).phrase,
      errorMessages.more(sandboxDocsLink(code), code).phrase,
    ],
  };
}

/**
 * The reason by its code, except that `other` shows what the check said
 * failed, when it said anything, since the code alone can't say what to fix.
 */
function sandboxReason(code: string, missing: readonly string[]): Message {
  const said = readsAsOther(code) ? toolSentence(missing) : undefined;
  return said === undefined
    ? sandboxMessages.reason(code, { missing })
    : sandboxMessages.whatFailed(said);
}

/** A colour or cursor code, taken out whole so none of it is left on the line. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the escape character starts the code
const colourCode = /\u001b\[[0-?]*[ -/]*[@-~]/gu;

/** The most of the check's sentence `doctor` shows; the rest is cut with "…". */
const toolSentenceLength = 200;

/**
 * The check's own sentence as one line: its first line, trimmed, without
 * colour codes or control characters, and cut at about 200 characters, so
 * it can't flood the screen. It gets no full stop, since it may end in a
 * path or its own punctuation. `undefined` when the check said nothing.
 *
 * @example
 * toolSentence(["bwrap: setting up uid map: Permission denied\n  at …"]);
 * // "bwrap: setting up uid map: Permission denied"
 */
function toolSentence(missing: readonly string[]): string | undefined {
  for (const sentence of missing) {
    const [first = ""] = sentence.split(/\r?\n/u);
    const line = withoutUnsafe(first.replace(colourCode, "")).trim();
    if (line === "") continue;
    const characters = Array.from(line);
    if (characters.length <= toolSentenceLength) return line;
    return `${characters
      .slice(0, toolSentenceLength - 1)
      .join("")
      .trimEnd()}…`;
  }
  return undefined;
}

/**
 * "No problems." or the count of ✕ lines, then what each ✕ line stops in the
 * lines' order (Models before Sandbox), then the count of ! lines.
 */
function summaryLine(report: DoctorReport): Phrase {
  const { problems, warnings } = report.summary;
  const parts: Message[] = [
    problems === 0 ? doctorMessages.noProblems() : doctorMessages.problems(problems),
  ];
  if (report.models?.status === "failed") {
    const servers = report.models.problems.flatMap((problem) =>
      problem.problem === "unreachable" ? [problem.name] : [],
    );
    parts.push(doctorMessages.modelsStop(servers));
  }
  if (report.sandbox.status === "failed") parts.push(doctorMessages.sandboxStops());
  if (warnings > 0) parts.push(doctorMessages.warnings(warnings));
  return parts.flatMap((part, index) => (index === 0 ? part.phrase : [" ", ...part.phrase]));
}
