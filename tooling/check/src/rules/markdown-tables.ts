import type { CheckContext } from "../lib/context.ts";
import { firstPaddedLine } from "../lib/markdown-tables.ts";
import { Report } from "../lib/problems.ts";

/**
 * Markdown tables stay unpadded (`| a | b |`), so adding a row changes one
 * line. A table padded to equal widths is rewritten by every longer cell, and
 * two pull requests that each add a row conflict in the merge queue.
 */
export function checkMarkdownTables(context: CheckContext): Report {
  const report = new Report("markdown-tables");
  for (const file of context.files.filter((name) => name.endsWith(".md"))) {
    const line = firstPaddedLine(context.read(file));
    if (line !== undefined) {
      report.error(
        file,
        'A table is padded to equal column widths, so one longer cell rewrites every row and two pull requests adding a row conflict. Run "pnpm check:tables".',
        line,
      );
    }
  }
  return report;
}
