import type { CheckContext } from "../lib/context.ts";
import { isSourceFile, isTestFile } from "../lib/source-files.ts";
import type { Checkouts, GuardFinding } from "./finding.ts";
import { readTestFileFacts, type SkipUse } from "./test-file-facts.ts";

/**
 * Plan 9.3, point 3: any way of skipping a test needs a note: `.skip`,
 * `.only`, `.todo`, `skipIf`, `runIf`, `ctx.skip()`, `test.fails` and a
 * `retry` option. Biome's noSkippedTests and noFocusedTests back this up.
 * Counts each kind per file, so skips the merge base already had (and a
 * note once allowed) don't fail again.
 */
export function checkSkips({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  for (const file of head.files.filter(isWatched)) {
    const before = base.files.includes(file) ? countByKind(skipsIn(base, file)) : new Map();
    const after = skipsIn(head, file);
    for (const [kind, count] of countByKind(after)) {
      if (count <= (before.get(kind) ?? 0)) {
        continue;
      }
      const first = after.find((use) => use.kind === kind);
      findings.push({
        subject: file,
        file,
        ...(first === undefined ? {} : { line: first.line }),
        message: `${file} adds a skip: ${kind} (${count}, ${before.get(kind) ?? 0} on the merge base).`,
      });
    }
  }
  return findings;
}

/** Test files, and the Vitest configs where a `retry` setting could hide. */
export function isWatched(file: string): boolean {
  if (!isSourceFile(file)) {
    return false;
  }
  return isTestFile(file) || /(?:^|\/)vitest\.config\.[cm]?[jt]s$/.test(file) || isPreset(file);
}

/** The shared Vitest preset, which every package's config builds on. */
export function isPreset(file: string): boolean {
  return file === "tooling/config/src/vitest-preset.ts";
}

function skipsIn(context: CheckContext, file: string): readonly SkipUse[] {
  return readTestFileFacts(file, context.read(file)).skips;
}

function countByKind(uses: readonly SkipUse[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const use of uses) {
    counts.set(use.kind, (counts.get(use.kind) ?? 0) + 1);
  }
  return counts;
}
