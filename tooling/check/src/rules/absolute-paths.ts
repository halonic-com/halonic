import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { isTestFile } from "../lib/source-files.ts";

const checked = /\.(?:[cm]?[jt]sx?|md|mdx|json|jsonc|ya?ml|toml|astro|css|html|rs|sh|ps1|txt|svg)$/;

/** Files without an extension, such as `Dockerfile` or `.gitignore`, are text too. */
function hasNoExtension(file: string): boolean {
  return !/.\./.test(file.split("/").at(-1) ?? "");
}

/**
 * Paths that only exist on one person's or one agent's machine. Built from
 * parts so this file doesn't trip its own check.
 */
const machinePaths: readonly RegExp[] = [
  /(?<![\w.])[A-Za-z]:(?:\\{1,2}|\/)[\w.$~-]/,
  new RegExp(`(?<![\\w.~])/(?:${["home", "Users", "root"].join("|")})/[\\w.-]+`),
  new RegExp(`(?<![\\w.])/(?:${["mnt/[a-z]", "paperclip", "tmp/paperclip"].join("|")})/`),
  /\\\\wsl(?:\$|\.localhost)\\/i,
];

/** Test files and fixtures may hold such paths on purpose, for example in attack tests. */
function isExempt(file: string): boolean {
  return isTestFile(file) || /(?:^|\/)(?:fixtures|__fixtures__|golden)\//.test(file);
}

/**
 * Fails on absolute local paths (such as a folder on any Windows drive or a
 * Linux home folder) in docs, code, scripts and config. They leak who wrote
 * the file and where, and they never work on another machine (plan 10.2, 11).
 */
export function checkAbsolutePaths(context: CheckContext): Report {
  const report = new Report("absolute-paths");
  for (const file of context.files) {
    if (!(checked.test(file) || hasNoExtension(file)) || isExempt(file)) {
      continue;
    }
    const text = context.read(file);
    if (text.includes("\0")) {
      continue;
    }
    text.split("\n").forEach((text, index) => {
      if (machinePaths.some((pattern) => pattern.test(text))) {
        report.error(
          file,
          "This line holds an absolute path from one machine. Use a path relative to the repo root, or a placeholder such as <workspace> or ~/.config/halonic (plan 10.2).",
          index + 1,
        );
      }
    });
  }
  return report;
}
