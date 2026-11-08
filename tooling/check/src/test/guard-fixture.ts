import type { ApprovalLookup } from "../guard/approvals.ts";
import type { GuardCheck } from "../guard/finding.ts";
import { checkRequirementGuard } from "../guard/guard.ts";
import { loadContext } from "../lib/context.ts";
import { manifestFor, removeFixtureRepo, writeFixtureRepo } from "./fixture-repo.ts";

/** The package every guard fixture puts its files in. */
export const workflowDirectory = "packages/core/workflow";
export const branch = "julian/HAL-118-example";
export const noteFile = `decisions/${branch}.md`;

/** One guard run: the workflow package's files on the merge base and in the pull request. */
export interface GuardCase {
  /** Files of the workflow package on the merge base, relative to the package. */
  readonly base: Readonly<Record<string, string>>;
  /** The same in the pull request. */
  readonly head: Readonly<Record<string, string>>;
  /** Files outside the package, in both checkouts. */
  readonly shared?: Readonly<Record<string, string>>;
  /** The text of the branch's decision note, if the pull request has one. */
  readonly note?: string;
  /** What the approval lookup answers. Defaults to approved. */
  readonly approved?: boolean;
  /** The checks to run; every check when left out. */
  readonly checks?: readonly GuardCheck[];
}

/** What the guard reported, as `file: message` lines. */
export interface GuardOutcome {
  readonly errors: string[];
  readonly warnings: string[];
}

/** Builds both checkouts, runs the guard and removes them again. */
export async function runGuard(guardCase: GuardCase): Promise<GuardOutcome> {
  const repo = (files: Readonly<Record<string, string>>, extra: Record<string, string>): string =>
    writeFixtureRepo(
      [
        {
          directory: workflowDirectory,
          manifest: manifestFor("@halonicjs/workflow", "core"),
          files: { "src/index.ts": "export const x = 1;\n", ...files },
        },
      ],
      { coreOrder: ["@halonicjs/workflow"], extraFiles: { ...guardCase.shared, ...extra } },
    );
  const baseRoot = repo(guardCase.base, {});
  const headRoot = repo(
    guardCase.head,
    guardCase.note === undefined ? {} : { [noteFile]: guardCase.note },
  );
  const approvals: ApprovalLookup = {
    check: () =>
      Promise.resolve(
        guardCase.approved === false
          ? { approved: false, reason: "the approval is for another branch" }
          : { approved: true },
      ),
  };
  try {
    const report = await checkRequirementGuard({
      base: loadContext(baseRoot),
      head: loadContext(headRoot),
      branch,
      approvals,
      ...(guardCase.checks === undefined ? {} : { checks: guardCase.checks }),
    });
    const lines = (severity: string): string[] =>
      report.problems
        .filter((problem) => problem.severity === severity)
        .map((problem) => `${problem.file}: ${problem.message}`);
    return { errors: lines("error"), warnings: lines("warning") };
  } finally {
    removeFixtureRepo(baseRoot);
    removeFixtureRepo(headRoot);
  }
}

/** A decision note that covers these subjects. */
export function noteCovering(...subjects: string[]): string {
  return `# Decision: change the timer rules

- Approval: https://paperclip.example/HAL/approvals/1234
- Kind: internal

The timer moved to the routines package.

## Covers

${subjects.map((subject) => `- \`${subject}\``).join("\n")}
`;
}

/** A requirement file of the workflow package. */
export function requirementText(name: string, status = "active", statement?: string): string {
  return `# workflow.${name}

- Status: ${status}
- Since: 0.1.0
- Source: HAL-118

${statement ?? `When the delay has passed, the engine shall fire the ${name} timer.`}

## Examples

- Given a timer of 5 minutes, when 5 minutes pass, then it fires.
`;
}
