import type { CheckFact, ModelsFact } from "./check-facts.ts";

/** A line's state: ✓ works, ✕ problem, ! warning, – info. Never only a colour. */
export type CheckMark = "pass" | "problem" | "warning" | "info";

/** The glyph each mark has on screen and in the report (first-run-progress 4.2, 4.3). */
export const checkGlyphs: Readonly<Record<CheckMark, string>> = {
  pass: "✓",
  problem: "✕",
  warning: "!",
  info: "–",
};

const statusMarks = { ok: "pass", warning: "warning", failed: "problem" } as const;

/**
 * The mark of a line (requirement `check-computer.report`). One cause counts once: a line that
 * failed because of a line above it (Last run's `causeShownOn`, Default model's Models cause) is
 * info, so the crosses always match the heading's count (4.2). An unfinished Google setup is
 * progress, never a fault.
 *
 * @example
 * checkMark({ check: "last-run", status: "failed", causeShownOn: "models", … }); // "info"
 */
export function checkMark(fact: CheckFact): CheckMark {
  if ("timedOut" in fact) return "warning";
  switch (fact.check) {
    case "engine":
      return fact.running ? "pass" : "problem";
    case "models":
      return modelsMark(fact);
    case "default-model":
      if (fact.target.uses === "sample-answers") return "info";
      if (fact.cause === undefined) return "pass";
      return fact.cause === "default-model.local-only" ? "problem" : "info";
    case "last-run":
      return fact.causeShownOn === undefined ? "problem" : "info";
    case "google":
    case "not-checked":
      return "info";
    default:
      return statusMarks[fact.status];
  }
}

/**
 * The Models line: a problem when a server doesn't answer, a key is missing or a test failed; a
 * pass when something answered; else info, for keys not tested yet and Sample answers.
 */
function modelsMark({ servers, keys, sampleAnswers, tests }: ModelsFact): CheckMark {
  if (servers !== undefined && "timedOut" in servers) return "warning";
  const failed =
    servers?.status === "failed" ||
    keys.some((key) => key.keyStored !== true) ||
    tests.some((test) => test.outcome !== "ok");
  if (failed) return "problem";
  const working = (servers?.ready.length ?? 0) > 0 || tests.some((test) => test.outcome === "ok");
  if (working) return "pass";
  return sampleAnswers || keys.length > 0 ? "info" : "pass";
}

/**
 * The heading: "1 problem", "1 problem · 1 warning", "1 warning" or "No problems found", counting
 * the marks, which are causes, not lines (4.2).
 */
export function checkHeading(marks: readonly CheckMark[]): string {
  const counts = [...countOf(marks, "problem"), ...countOf(marks, "warning")];
  return counts.length === 0 ? "No problems found" : counts.join(" · ");
}

function countOf(marks: readonly CheckMark[], mark: "problem" | "warning"): string[] {
  const count = marks.filter((each) => each === mark).length;
  if (count === 0) return [];
  return [`${count} ${mark}${count === 1 ? "" : "s"}`];
}
