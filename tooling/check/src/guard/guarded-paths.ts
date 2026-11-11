import type { CheckContext } from "../lib/context.ts";
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
  ".gitattributes",
  "packages/testing/parity/allowed-differences.json",
  "packages/testing/spec/",
  "tooling/check/",
  "tooling/config/src/vitest-preset.ts",
  "turbo.json",
];

/**
 * Where packages' deliberate extra entry points live. A change to it that
 * touches nothing but `extraExports` is routine, so it doesn't count as a
 * change to `tooling/check/`: it needs a note that lists this file, and
 * an `internal` one is enough (HAL-1337, decided on HAL-3434). Any other
 * change to it stays a change to the guard.
 */
export const policyFile = "tooling/check/policy.json";

/**
 * Whether `policy.json` changed from `before` to `after` in `extraExports`
 * only. Both sides must be JSON objects; everything else must parse to the
 * same keys, in the same order, with the same values. Anything it can't
 * tell is not "only".
 */
export function onlyExtraExportsChanged(
  before: string | undefined,
  after: string | undefined,
): boolean {
  const rest = (text: string | undefined): string | undefined => {
    try {
      const json: unknown = text === undefined ? undefined : JSON.parse(text);
      if (typeof json !== "object" || json === null || Array.isArray(json)) {
        return undefined;
      }
      const { extraExports: _extraExports, ...others } = json as Record<string, unknown>;
      return JSON.stringify(others);
    } catch {
      return undefined;
    }
  };
  const [restBefore, restAfter] = [rest(before), rest(after)];
  return before !== after && restBefore !== undefined && restBefore === restAfter;
}

/** The entry of `guardedPaths` a file falls under, if any. */
export function guardedPathOf(file: string): string | undefined {
  return guardedPaths.find((path) => (path.endsWith("/") ? file.startsWith(path) : file === path));
}

/**
 * A changed, added or deleted file under one of the
 * guard's own paths needs a note that lists that path, as written in
 * `guardedPaths`. A change to `policy.json` in `extraExports` only needs
 * a note that lists `policy.json` itself.
 */
export function checkGuardedPaths({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const files = new Set([...base.files, ...head.files]);
  for (const file of [...files].sort()) {
    const path =
      file === policyFile &&
      onlyExtraExportsChanged(optionalRead(base, file), optionalRead(head, file))
        ? policyFile
        : guardedPathOf(file);
    const change = path === undefined ? undefined : changeOf(file, base, head);
    if (path !== undefined && change !== undefined) {
      findings.push({
        subject: path,
        file,
        message:
          path === policyFile
            ? `${file} was changed in extraExports only, which needs a note that lists ${path}.`
            : `${file} was ${change}, and ${path} is part of the requirement guard.`,
      });
    }
  }
  return findings;
}

function optionalRead(checkout: CheckContext, file: string): string | undefined {
  return checkout.files.includes(file) ? checkout.read(file) : undefined;
}
