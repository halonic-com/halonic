import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { isTestFile, isTextFile } from "../lib/source-files.ts";

/**
 * Paths that only exist on one person's or one agent's machine. Built from
 * parts so this file doesn't trip its own check.
 */
const machinePaths: readonly RegExp[] = [
  /(?<![\w.])[A-Za-z]:(?:\\{1,2}|\/)(?:Users|Documents and Settings)\b/i,
  new RegExp(`(?<![\\w.~])/(?:${["home", "Users", "root"].join("|")})/[\\w.-]+`),
  new RegExp(`(?<![\\w.])/(?:${["mnt/[a-z]", "paperclip", "tmp/paperclip"].join("|")})/`),
  /\\\\wsl(?:\$|\.localhost)\\/i,
];

/** Test files and fixtures may hold such paths on purpose, for example in attack tests. */
function isExempt(file: string): boolean {
  return isTestFile(file) || /(?:^|\/)(?:fixtures|__fixtures__|golden)\//.test(file);
}

/**
 * Fails on absolute local paths (such as a Windows user folder or a Linux
 * home folder) in docs, code and config. They leak who wrote the file and
 * where, and they never work on another machine.
 */
export function checkAbsolutePaths(context: CheckContext): Report {
  const report = new Report("absolute-paths");
  for (const file of context.files) {
    if (!isTextFile(file) || isExempt(file)) {
      continue;
    }
    context
      .read(file)
      .split("\n")
      .forEach((text, index) => {
        if (machinePaths.some((pattern) => pattern.test(text))) {
          report.error(
            file,
            "This line holds an absolute path from one machine. Use a path relative to the repo root, or a placeholder such as <workspace> or ~/.config/halonic.",
            index + 1,
          );
        }
      });
  }
  return report;
}
