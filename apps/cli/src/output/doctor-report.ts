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
  ProviderReport,
  SandboxLine,
  WorkspaceLine,
} from "@halonicjs/app";
import type { Message } from "../messages/define.ts";
import { type DataUse, doctorMessages } from "../messages/doctor.ts";
import { errorMessages } from "../messages/general.ts";
import { markPart, type Phrase, phrase, plainText } from "../messages/phrase.ts";
import { sandboxDocsLink, sandboxMessages } from "../messages/sandbox.ts";
import { shownSize } from "../messages/size.ts";
import type { Mark } from "./paint.ts";
import { printable } from "./printable.ts";

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
 * Models, Sandbox, Harnesses, Disk, each only when the report has it, with
 * an empty line after the heading and before the summary.
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
    sandboxCheck(report.sandbox, facts.sandboxKind),
    report.harnesses && harnessesCheck(report.harnesses),
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
    lines: [workspaceTrust(line, dir).phrase],
  };
}

function workspaceTrust(line: WorkspaceLine, dir: string | undefined): Message {
  switch (line.trust) {
    case "trusted":
      return doctorMessages.trusted(line.name);
    case "changed":
      return doctorMessages.changedSinceTrusted(dir);
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

/** ✓ with the kind of sandbox, or ✕ with the reason, the fix and `More:` by the reason's code. */
function sandboxCheck(line: SandboxLine, kind: string): CheckLines {
  const label = doctorMessages.sandboxLabel();
  if (line.status === "ok") {
    return { status: line.status, label, lines: [doctorMessages.sandboxReady(kind).phrase] };
  }
  return {
    status: line.status,
    label,
    lines: [
      doctorMessages.sandboxCantStart().phrase,
      sandboxMessages.reason(line.reason).phrase,
      sandboxMessages.doctorFix(line.reason).phrase,
      errorMessages.more(sandboxDocsLink(line.reason), line.reason).phrase,
    ],
  };
}

/** The harnesses that are ready on one line, then each problem with its fix under it. */
function harnessesCheck(line: HarnessesLine): CheckLines {
  const ready = line.installed.map(
    ({ name, version }) => doctorMessages.harnessReady(name, printable(version)).phrase,
  );
  const readyLine = ready.length === 0 ? [] : [joined(ready)];
  return {
    status: line.status,
    label: doctorMessages.harnessesLabel(),
    lines: [...readyLine, ...line.problems.flatMap(harnessProblem)],
  };
}

function harnessProblem(problem: HarnessProblem): Phrase[] {
  switch (problem.problem) {
    case "missing":
      return [
        doctorMessages.harnessMissing(problem.agent, problem.name).phrase,
        doctorMessages.installHarness(problem.name).phrase,
      ];
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
