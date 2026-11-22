import type {
  DefaultModelLine,
  DiskLine,
  HarnessesLine,
  HarnessProblem,
  LastRunLine,
  SandboxLine,
  WorkspaceLine,
} from "@halonicjs/app";
import { shownSize } from "@halonicjs/words";
import type { CheckFact, CheckLineId, GoogleFact, NotCheckedFact } from "../check-facts.ts";
import { type CheckMark, checkMark } from "../check-marks.ts";
import { modelsReport } from "./report-models.ts";
import { causeInReport, dayInReport, providerInReport } from "./report-names.ts";

/** One line of the report: its label, its mark, and its facts, the first beside the label. */
export interface ReportLine {
  readonly label: string;
  readonly mark: CheckMark;
  readonly facts: readonly string[];
}

/** Each line's label, the same as on screen. */
export const lineLabels: Readonly<Record<CheckLineId, string>> = {
  engine: "Engine",
  workspace: "Workspace",
  models: "Models",
  "default-model": "Default model",
  "last-run": "Last run",
  sandbox: "Sandbox",
  harnesses: "Harnesses",
  network: "Network",
  disk: "Disk",
  google: "Google",
  "not-checked": "Not checked",
};

const trustWords: Readonly<Record<WorkspaceLine["trust"], string>> = {
  trusted: "trusted",
  new: "not trusted yet",
  unreadable: "not trusted yet",
  changed: "changed since it was trusted",
  refused: "can't be trusted",
  "not-needed": "test model only, no trust needed",
};

/** The Workspace line without its name: the demo, its trust, and counts. */
function workspaceReport(line: WorkspaceLine, demo: boolean): string[] {
  const facts = [...(demo ? ["demo · can open"] : []), trustWords[line.trust]];
  if (line.fileProblems !== undefined) facts.push(`${line.fileProblems} problems in its files`);
  if (line.windowsDrive !== undefined) facts.push("on a Windows drive");
  if (line.tooManyFilesToWatch !== undefined) facts.push("too many files to watch");
  return [facts.join(" · ")];
}

const strengthWords = {
  os: "fenced by the system",
  vm: "in a virtual machine",
  remote: "on another computer",
  none: "no fence",
} as const;

/** The Sandbox line: its fence, or the closed reason code it can't start with, never `missing`. */
function sandboxReport(line: SandboxLine): string[] {
  if (line.status === "ok") return [`ready · ${strengthWords[line.capabilities.strength]}`];
  return [`can't start · ${line.reason}`];
}

const harnessProblemWords: Readonly<Record<HarnessProblem["problem"], string>> = {
  missing: "not installed",
  unsupported: "too old",
  failed: "couldn't be asked",
  "model-refused": "can't use its model",
  "signed-out": "not signed in",
  "searches-web": "searches the web",
};

/** The Harnesses line as counts: no harness, agent or alias names, and never a program's error. */
function harnessesReport(line: HarnessesLine): string[] {
  const parts = [`${line.installed.length} ready`];
  for (const [problem, words] of Object.entries(harnessProblemWords)) {
    const count = line.problems.filter((each) => each.problem === problem).length;
    if (count > 0) parts.push(`${count} ${words}`);
  }
  return [parts.join(" · ")];
}

function diskReport(line: DiskLine): string[] {
  if (line.problem === "unreadable" || line.freeBytes === null) return ["free space unknown"];
  if (line.problem === "low") return [`low on disk space: ${shownSize(line.freeBytes)} free`];
  if (line.data === null) return [`${shownSize(line.freeBytes)} free`];
  return [
    `${shownSize(line.freeBytes)} free · Halonic uses ${shownSize(line.data.bytes)} (run logs ${shownSize(line.data.runLogBytes)})`,
  ];
}

function defaultModelReport(line: DefaultModelLine): string[] {
  if (line.target.uses === "sample-answers") return ["uses Sample answers"];
  const target = `points at ${providerInReport(line.target.name)}`;
  if (line.cause === undefined) return [target];
  if (line.cause === "default-model.local-only") return [`${target} · Local only refuses it`];
  return [`${target} · not checked until Models works`];
}

/** The label of the line a cause is shown on; a doctor line this dialog doesn't show reads "a line above". */
function labelOf(line: string): string {
  const labels: Readonly<Record<string, string>> = lineLabels;
  return labels[line] ?? "a line above";
}

/** The Last run line: step n of m and the cause, never the step's or the agent's name. */
function lastRunReport(line: LastRunLine): string[] {
  const where = `failed at step ${line.step} of ${line.steps}`;
  if (line.causeShownOn !== undefined)
    return [`${where} · because of ${labelOf(line.causeShownOn)}`];
  return [`${where} · cause ${causeInReport(line.cause)}`];
}

/** The Google line: the step and the day it started, never the account's address. */
function googleReport(line: GoogleFact): string[] {
  return [`setup at step ${line.step} of ${line.steps}, started ${dayInReport(line.startedAt)}`];
}

function notCheckedReport(line: NotCheckedFact): string[] {
  return [`${line.parts.join(", ")} · not used here`];
}

/** The facts of one line, from the fields named here only (first-run-progress 4.3). */
function reportFacts(fact: CheckFact, demo: boolean): string[] {
  if ("timedOut" in fact) return ["didn't answer in 5 seconds"];
  switch (fact.check) {
    case "engine":
      return [fact.running ? "running" : "not running"];
    case "workspace":
      return workspaceReport(fact, demo);
    case "models":
      return modelsReport(fact);
    case "default-model":
      return defaultModelReport(fact);
    case "last-run":
      return lastRunReport(fact);
    case "sandbox":
      return sandboxReport(fact);
    case "harnesses":
      return harnessesReport(fact);
    case "network":
      return [
        fact.problem === "proxy-not-http" ? "a proxy setting isn't http" : "a proxy can't be used",
      ];
    case "disk":
      return diskReport(fact);
    case "google":
      return googleReport(fact);
    case "not-checked":
      return notCheckedReport(fact);
  }
}

/**
 * One line of the report (requirement `check-computer.report`): its label, its mark and its
 * facts, built from named fields only. `demo` says the open workspace is the demo, which the
 * Workspace line says instead of its name.
 *
 * @example
 * reportLine({ check: "google", step: 4, steps: 7, startedAt, email: "x@example.com" }, false);
 * // { label: "Google", mark: "info", facts: ["setup at step 4 of 7, started 8 Nov"] }
 */
export function reportLine(fact: CheckFact, demo: boolean): ReportLine {
  return { label: lineLabels[fact.check], mark: checkMark(fact), facts: reportFacts(fact, demo) };
}
