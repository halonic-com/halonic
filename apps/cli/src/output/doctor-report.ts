// Turns the `DoctorService`'s report into the lines `halonic doctor` prints
// (cli-output 3.7): the heading, one line per check with its mark and label,
// the reasons and fixes under it, then the summary. Every word comes from the
// catalogue; this file only decides which sentence goes where.

import type {
  DiskLine,
  DoctorReport,
  DoctorStatus,
  HarnessesLine,
  HarnessProblem,
  ModelProblem,
  ModelsLine,
  NodeLine,
  ProviderReport,
  SandboxLine,
  WorkspaceLine,
} from "@halonicjs/app";
import { type SignInShell, signInCommandText } from "@halonicjs/ports";
import type { Message } from "../messages/define.ts";
import { type DataUse, doctorMessages } from "../messages/doctor.ts";
import { errorMessages } from "../messages/general.ts";
import { markPart, type Phrase, phrase, plainText } from "../messages/phrase.ts";
import {
  readsAsOther,
  sandboxDocsLink,
  sandboxMessages,
  windowsNodeInWsl,
  wsl2FolderDocs,
} from "../messages/sandbox.ts";
import { shownSize } from "../messages/size.ts";
import type { Mark } from "./paint.ts";
import { printable, withoutUnsafe } from "./printable.ts";

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
 * Models, Sandbox, Harnesses, Node.js (HAL-6517) and Disk, each only when
 * the report has it, with an empty line after the heading and before the
 * summary.
 *
 * @example
 * doctorReportLines(report, { version: "0.1.0", system: "Linux x64", sandboxKind: "bubblewrap" });
 * // ["Halonic 0.1.0 · Linux x64", "", "✓ Workspace   acme · trusted on this computer", …,
 * //  "", "No problems."] (as phrases)
 */
export function doctorReportLines(report: DoctorReport, facts: DoctorFacts): Phrase[] {
  const checks = [
    report.workspace && workspaceCheck(report.workspace, facts.dir),
    report.models && modelsCheck(report.models),
    sandboxCheck(report.sandbox, facts, report.node),
    report.harnesses && harnessesCheck(report.harnesses, facts.signInShell),
    report.node && nodeCheck(report.node),
    diskCheck(report.disk),
  ].filter((check) => check !== undefined);
  return [
    doctorMessages.heading(facts.version, facts.system).phrase,
    [],
    ...checks.flatMap(checkLines),
    [],
    summaryLine(report),
  ];
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

function workspaceCheck(line: WorkspaceLine, dir: string | undefined): CheckLines {
  return {
    status: line.status,
    label: doctorMessages.workspaceLabel(),
    lines: [
      workspaceTrust(line, dir).phrase,
      ...(line.windowsDrive === undefined
        ? []
        : [
            doctorMessages.onWindowsDrive(line.windowsDrive).phrase,
            doctorMessages.moveToLinuxHome().phrase,
            errorMessages.more(wsl2FolderDocs).phrase,
          ]),
    ],
  };
}

function workspaceTrust(line: WorkspaceLine, dir: string | undefined): Message {
  if (line.fileProblems !== undefined) {
    return doctorMessages.fileProblems(line.name, line.fileProblems, dir);
  }
  switch (line.trust) {
    case "trusted":
      return doctorMessages.trusted(line.name);
    case "not-needed":
      return doctorMessages.testModelOnly(line.name);
    case "changed":
      return doctorMessages.changedSinceTrusted(dir);
    case "refused":
      return doctorMessages.refused(dir);
    case "new":
    case "unreadable":
      // A record that can't be read reads as not trusted, because `halonic trust` writes it again.
      return doctorMessages.notTrusted(dir);
  }
}

/** The providers that are ready, one per line, then the problems, the unreachable ones first. */
function modelsCheck(line: ModelsLine): CheckLines {
  return {
    status: line.status,
    label: doctorMessages.modelsLabel(),
    lines: [...line.ready.map(readyProvider), ...modelProblems(line.problems)],
  };
}

function readyProvider(provider: ProviderReport): Phrase {
  if ("keyStored" in provider) return doctorMessages.keyStored(provider.name).phrase;
  const loaded =
    provider.models.length === 0
      ? undefined
      : doctorMessages.loaded(
          provider.models.map(({ name, memoryBytes }) =>
            memoryBytes === undefined ? { name } : { name, size: shownSize(memoryBytes) },
          ),
        ).phrase;
  return doctorMessages.answering(provider.name, provider.address, loaded).phrase;
}

/** One line per unreachable server, then one line per provider naming its aliases without a key. */
function modelProblems(problems: readonly ModelProblem[]): Phrase[] {
  const lines: Phrase[] = [];
  const aliasesByProvider = new Map<string, { name: string; aliases: string[] }>();
  for (const problem of problems) {
    if (problem.problem === "unreachable") {
      lines.push(doctorMessages.notAnswering(problem.name, problem.address).phrase);
      continue;
    }
    const entry = aliasesByProvider.get(problem.provider) ?? { name: problem.name, aliases: [] };
    entry.aliases.push(problem.alias);
    aliasesByProvider.set(problem.provider, entry);
  }
  for (const { name, aliases } of aliasesByProvider.values()) {
    lines.push(doctorMessages.needKey(aliases, name).phrase);
  }
  return lines;
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

/** The harnesses that are ready on one line, then each problem with its fix under it. */
function harnessesCheck(line: HarnessesLine, shell: SignInShell): CheckLines {
  const ready = line.installed.map(
    ({ name, version }) => doctorMessages.harnessReady(name, printable(version)).phrase,
  );
  const readyLine = ready.length === 0 ? [] : [joined(ready)];
  return {
    status: line.status,
    label: doctorMessages.harnessesLabel(),
    lines: [...readyLine, ...line.problems.flatMap((problem) => harnessProblem(problem, shell))],
  };
}

function harnessProblem(problem: HarnessProblem, shell: SignInShell): Phrase[] {
  switch (problem.problem) {
    case "missing":
      return [
        doctorMessages.harnessMissing(problem.agent, problem.name).phrase,
        doctorMessages.installHarness(problem.name).phrase,
      ];
    case "signed-out": {
      const command = signInCommandText(problem.signIn, problem.settingsFolder, shell);
      return [
        doctorMessages.agentSignedOut(problem.name, problem.agent).phrase,
        doctorMessages.signInForAgent(problem.agent, printable(command)).phrase,
      ];
    }
    case "unsupported":
      return [
        doctorMessages.harnessUnsupported(
          problem.name,
          printable(problem.version),
          problem.supported,
        ).phrase,
        doctorMessages.updateHarness(problem.name).phrase,
      ];
    case "failed":
      return [doctorMessages.harnessVersionFailed(problem.name, printable(problem.error)).phrase];
  }
}

/** What is wrong with the Node.js that runs Halonic, and the fix under it. */
function nodeCheck(line: NodeLine): CheckLines {
  const lines =
    line.problem === "windows-node-in-wsl"
      ? [doctorMessages.windowsNodeInWsl().phrase, doctorMessages.installNodeInWsl().phrase]
      : [
          doctorMessages.windowsPnpm(printable(line.pnpm)).phrase,
          doctorMessages.installPnpmInWsl().phrase,
        ];
  return { status: line.status, label: doctorMessages.nodeLabel(), lines };
}

function diskCheck(line: DiskLine): CheckLines {
  const label = doctorMessages.diskLabel();
  const use = dataUse(line);
  if (line.freeBytes === null) {
    return {
      status: line.status,
      label,
      lines: [doctorMessages.freeUnknown(use).phrase, doctorMessages.freeUnknownReason().phrase],
    };
  }
  const free = shownSize(line.freeBytes);
  const words =
    line.problem === "low" ? doctorMessages.lowOnDisk(free) : doctorMessages.diskFree(free, use);
  return { status: line.status, label, lines: [words.phrase] };
}

/** What Halonic's data takes, or nothing when a folder couldn't be read. */
function dataUse(line: DiskLine): DataUse | undefined {
  if (line.data === null) return undefined;
  return {
    total: shownSize(line.data.bytes),
    runLogs: shownSize(line.data.runLogBytes),
    ...(line.data.complete ? {} : { atLeast: true }),
  };
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
  return joined(
    parts.map((part) => part.phrase),
    [" "],
  );
}

/** Phrases on one line, with " · " between them unless another separator is given. */
function joined(
  phrases: readonly Phrase[],
  separator: Phrase = phrase` ${markPart("separator")} `,
): Phrase {
  return phrases.flatMap((part, index) => (index === 0 ? part : [...separator, ...part]));
}
