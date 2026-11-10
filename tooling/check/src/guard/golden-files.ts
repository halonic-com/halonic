import type { CheckContext } from "../lib/context.ts";
import { isSourceFile, isTestFile } from "../lib/source-files.ts";
import { type Checkouts, changeOf, type GuardFinding } from "./finding.ts";
import { readTestFileFacts } from "./test-file-facts.ts";

/**
 * Golden files and snapshots (plan 9.3, 9.6): files in a `golden/` or
 * `__snapshots__/` folder, and `.snap` files. A public API's spec files, the
 * `.schema.json` files under a `spec/` folder, count too (HAL-1664): changing
 * one changes what outsiders rely on.
 */
export function isGoldenFile(file: string): boolean {
  return (
    /(?:^|\/)(?:golden|__snapshots__)\//.test(file) || file.endsWith(".snap") || isSpecFile(file)
  );
}

/** A spec file: a JSON Schema anywhere under a `spec/` folder. */
function isSpecFile(file: string): boolean {
  return /(?:^|\/)spec\/(?:[^/]+\/)*[^/]+\.schema\.json$/.test(file);
}

/**
 * Plan 9.3, point 3: a changed, added or deleted golden file or snapshot,
 * inline snapshots included, needs a note that lists the file.
 */
export function checkGoldenFiles({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const golden = new Set([...base.files, ...head.files].filter(isGoldenFile));
  for (const file of [...golden].sort()) {
    const change = changeOf(file, base, head);
    if (change !== undefined) {
      findings.push({ subject: file, file, message: `The golden file ${file} was ${change}.` });
    }
  }
  // The merge base's files too: a deleted test file removes its inline snapshots.
  const testFiles = new Set(
    [...base.files, ...head.files].filter((path) => isTestFile(path) && isSourceFile(path)),
  );
  for (const file of [...testFiles].sort()) {
    const before = inlineSnapshots(base, file);
    const after = inlineSnapshots(head, file);
    if (before.join("\0") !== after.join("\0")) {
      findings.push({
        subject: file,
        file,
        message: `${file} changes, adds or removes an inline snapshot (${after.length} now, ${before.length} on the merge base).`,
      });
    }
  }
  return findings;
}

function inlineSnapshots(context: CheckContext, file: string): readonly string[] {
  return context.files.includes(file)
    ? readTestFileFacts(file, context.read(file)).inlineSnapshots
    : [];
}
