import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { countLines, type PullRequestFiles, pullRequestFiles } from "../lib/pull-request-files.ts";
import { isSourceFile, isTestFile } from "../lib/source-files.ts";

const measured = /\.(?:[cm]?[jt]sx?|css|rs|astro)$/;

/** Generated files and test fixtures are exempt. */
export function isExemptFromSize(file: string): boolean {
  return (
    /(?:^|\/)(?:generated|fixtures|__fixtures__|golden)\//.test(file) ||
    /\.generated\.[a-z]+$/.test(file)
  );
}

/**
 * Keeps files and functions small, so agents can read a whole file and two
 * agents rarely edit the same one. On a pull request, a file it grows must
 * also stay `pullRequestHeadroom` lines below the limit, so two pull
 * requests that each pass can't add up to a file over it in the merge
 * queue (HAL-15461). Merge groups and main keep the plain limit.
 */
export function checkFileSize(context: CheckContext, pullRequest = pullRequestFiles): Report {
  const report = new Report("file-size");
  let changes: PullRequestFiles | undefined;
  if (context.policy.fileSize.pullRequestHeadroom > 0) {
    try {
      changes = pullRequest(context.root);
    } catch (error) {
      report.error("SIZE_RANGE", (error as Error).message);
    }
  }
  for (const file of context.files) {
    if (!measured.test(file) || isExemptFromSize(file)) {
      continue;
    }
    // A barrel that only re-exports grows a line with each feature and
    // holds no code, so it has no line limit (HAL-14368).
    if (!context.sourceFacts(file).reExportsOnly) {
      checkFileLines(context, file, report, changes);
    }
    // describe() blocks make test functions long by nature.
    if (isSourceFile(file) && !isTestFile(file)) {
      checkFunctionLines(context, file, report);
    }
  }
  return report;
}

function checkFileLines(
  context: CheckContext,
  file: string,
  report: Report,
  changes: PullRequestFiles | undefined,
): void {
  const { warnLines, maxLines, pullRequestHeadroom } = context.policy.fileSize;
  const lines = countLines(context.read(file));
  if (lines > maxLines) {
    report.error(
      file,
      `${lines} lines; the limit is ${maxLines}. Split it by concept: one file per view, service or helper, named after what it holds.`,
    );
  } else if (
    changes?.touched.has(file) &&
    lines > maxLines - pullRequestHeadroom &&
    lines > changes.linesBefore(file)
  ) {
    report.error(
      file,
      `${lines} lines, and this pull request grows it to within ${pullRequestHeadroom} lines of the ${maxLines}-line limit (it had ${changes.linesBefore(file)}). Another pull request in the queue could push it over: split it by concept in this pull request, to ${maxLines - pullRequestHeadroom} lines or fewer.`,
    );
  } else if (lines > warnLines) {
    report.warning(
      file,
      `${lines} lines; consider splitting above ${warnLines} (the hard limit is ${maxLines}).`,
    );
  }
}

function checkFunctionLines(context: CheckContext, file: string, report: Report): void {
  const { warnFunctionLines } = context.policy.fileSize;
  for (const span of context.sourceFacts(file).functions) {
    if (span.lineCount > warnFunctionLines) {
      report.warning(
        file,
        `function ${span.name} has ${span.lineCount} lines; consider splitting above ${warnFunctionLines}.`,
        span.line,
      );
    }
  }
}
