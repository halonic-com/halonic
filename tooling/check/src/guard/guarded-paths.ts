import { type Checkouts, changeOf, type GuardFinding } from "./finding.ts";

/**
 * The guard's own paths. CI runs the guard from the
 * merge base's copy, but a pull request's test results still come from its
 * own `testing/spec` and Vitest preset, and its own workflows decide what
 * runs. `allowed-differences.json` lists the signed-off exceptions to
 * parity, so each entry needs the same note as a golden file. A folder ends
 * in `/`; anything else is one file.
 *
 * The golden-file compare helpers and `testing/contracts/target/live` with
 * its sweeper join this list when they are added.
 */
export const guardedPaths: readonly string[] = [
  ".github/",
  "packages/testing/parity/allowed-differences.json",
  "packages/testing/spec/",
  "tooling/check/",
  "tooling/config/src/vitest-preset.ts",
  "turbo.json",
];

/** The entry of `guardedPaths` a file falls under, if any. */
export function guardedPathOf(file: string): string | undefined {
  return guardedPaths.find((path) => (path.endsWith("/") ? file.startsWith(path) : file === path));
}

/**
 * A changed, added or deleted file under one of the
 * guard's own paths needs a note that lists that path, as written in
 * `guardedPaths`.
 */
export function checkGuardedPaths({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const files = new Set([...base.files, ...head.files]);
  for (const file of [...files].sort()) {
    const path = guardedPathOf(file);
    const change = path === undefined ? undefined : changeOf(file, base, head);
    if (path !== undefined && change !== undefined) {
      findings.push({
        subject: path,
        file,
        message: `${file} was ${change}, and ${path} is part of the requirement guard.`,
      });
    }
  }
  return findings;
}
