import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { countLines, filesChangedSince, linesAt, sizeBase } from "../lib/size-base.ts";
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
 * agents rarely edit the same one. With a base commit (a pull request), a
 * file the change grows must also stay `prHeadroomLines` under the limit.
 */
export function checkFileSize(context: CheckContext, base = sizeBase()): Report {
  const report = new Report("file-size");
  const changed = base === undefined ? undefined : filesChangedSince(context.root, base);
  for (const file of context.files) {
    if (!measured.test(file) || isExemptFromSize(file)) {
      continue;
    }
    // A barrel that only re-exports grows a line with each feature and
    // holds no code, so it has no line limit (HAL-14368).
    if (!context.sourceFacts(file).reExportsOnly) {
      const lines = checkFileLines(context, file, report);
      if (base !== undefined && changed?.has(file)) {
        checkHeadroom(context, { file, lines, base }, report);
      }
    }
    // describe() blocks make test functions long by nature.
    if (isSourceFile(file) && !isTestFile(file)) {
      checkFunctionLines(context, file, report);
    }
  }
  return report;
}

/** Reports a file over the limits and returns its line count. */
function checkFileLines(context: CheckContext, file: string, report: Report): number {
  const { warnLines, maxLines } = context.policy.fileSize;
  const lines = countLines(context.read(file));
  if (lines > maxLines) {
    report.error(
      file,
      `${lines} lines; the limit is ${maxLines}. Split it by concept: one file per view, service or helper, named after what it holds.`,
    );
  } else if (lines > warnLines) {
    report.warning(
      file,
      `${lines} lines; consider splitting above ${warnLines} (the hard limit is ${maxLines}).`,
    );
  }
  return lines;
}

/**
 * A pull request that grows a file leaves room under the limit, so two
 * pull requests that each pass can't together push it over in the merge
 * queue (HAL-15461: two passing pull requests took a file to 513 lines).
 * A file over the limit already has its error; one the change doesn't grow
 * passes, so a small fix never forces a split.
 */
function checkHeadroom(
  context: CheckContext,
  { file, lines, base }: { file: string; lines: number; base: string },
  report: Report,
): void {
  const { maxLines, prHeadroomLines } = context.policy.fileSize;
  const room = maxLines - prHeadroomLines;
  if (lines <= room || lines > maxLines) {
    return;
  }
  const before = linesAt(context.root, base, file);
  if (lines > before) {
    report.error(
      file,
      `${lines} lines; a pull request may grow a file to at most ${room}, ${prHeadroomLines} under the limit of ${maxLines}, so two pull requests together can't push it over in the merge queue. Split it by concept in this pull request.`,
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
