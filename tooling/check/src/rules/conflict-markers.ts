import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

/**
 * A line git writes for a merge conflict: `<<<<<<< ` or `>>>>>>> ` and a
 * label, or `=======` alone. Written with counts so this file doesn't trip
 * its own check.
 */
const marker = /^(?:<{7} |={7}\r?$|>{7} )/;

/**
 * Fails on a merge-conflict marker left in any tracked file. Inside a
 * comment or a Markdown file, typecheck and tests pass with one
 * (HAL-16359). Files holding a NUL byte are binary and skipped. Tests that
 * need such a line build it from parts, as this file does.
 */
export function checkConflictMarkers(context: CheckContext): Report {
  const report = new Report("conflict-markers");
  for (const file of context.files) {
    const text = context.read(file);
    if (text.includes("\0")) {
      continue;
    }
    text.split("\n").forEach((line, index) => {
      if (marker.test(line)) {
        report.error(
          file,
          "This line is a merge-conflict marker left from a merge or rebase. Resolve the conflict and remove the marker lines.",
          index + 1,
        );
      }
    });
  }
  return report;
}
