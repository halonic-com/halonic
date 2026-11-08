import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import type { ApprovalLookup, ApprovalVerdict } from "./approvals.ts";
import { type DecisionNote, decisionNoteFile, parseDecisionNote } from "./decision-notes.ts";
import type { GuardCheck, GuardFinding } from "./finding.ts";

/** Every check of the requirement guard (plan 9.3, points 2 and 3). */
export const guardChecks: readonly GuardCheck[] = [];

/** What one guard run compares, and how it checks approvals. */
export interface GuardRun {
  /** The merge base (in the merge queue, the queue's base), with its test results. */
  readonly base: CheckContext;
  /** The pull request, with its test results. */
  readonly head: CheckContext;
  /** The pull request's branch, which names its decision note. */
  readonly branch: string;
  readonly approvals: ApprovalLookup;
  /** The checks to run; all of them unless a test picks some. */
  readonly checks?: readonly GuardCheck[];
}

/**
 * The requirement guard. Runs every check, and lets a finding through only
 * when the branch's decision note lists its subject under Covers and the
 * note's approval is verified. Everything else fails.
 */
export async function checkRequirementGuard(run: GuardRun): Promise<Report> {
  const report = new Report("requirement-guard");
  const checkouts = { base: run.base, head: run.head };
  const findings = (run.checks ?? guardChecks).flatMap((check) => check(checkouts));
  if (findings.length === 0) {
    return report;
  }
  const noteFile = decisionNoteFile(run.branch);
  if (!run.head.files.includes(noteFile)) {
    for (const finding of findings) {
      report.error(
        finding.file,
        `${finding.message} That needs a decision note: add ${noteFile}, list "${finding.subject}" under Covers and link an approval (plan 9.3).`,
        finding.line,
      );
    }
    return report;
  }
  const parsed = parseDecisionNote(noteFile, run.head.read(noteFile));
  if (!parsed.ok) {
    for (const problem of parsed.problems) {
      report.error(noteFile, `Malformed decision note: ${problem.message}`, problem.line);
    }
    for (const finding of findings) {
      report.error(finding.file, `${finding.message} ${noteFile} can't be read, see its errors.`);
    }
    return report;
  }
  const verdict = await run.approvals.check({
    approval: parsed.note.approval,
    branch: run.branch,
    kind: parsed.note.kind,
  });
  for (const finding of findings) {
    reportAgainstNote(finding, parsed.note, verdict, report);
  }
  return report;
}

function reportAgainstNote(
  finding: GuardFinding,
  note: DecisionNote,
  verdict: ApprovalVerdict,
  report: Report,
): void {
  if (!note.covers.includes(finding.subject)) {
    report.error(
      finding.file,
      `${finding.message} ${note.file} doesn't list "${finding.subject}" under Covers.`,
      finding.line,
    );
  } else if (!verdict.approved) {
    report.error(
      finding.file,
      `${finding.message} ${note.file} covers it, but its approval isn't verified: ${verdict.reason}.`,
      finding.line,
    );
  } else {
    report.warning(
      finding.file,
      `${finding.message} Allowed by ${note.file} (${note.approval}).`,
      finding.line,
    );
  }
}
