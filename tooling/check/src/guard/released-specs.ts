import { type Checkouts, changeOf, type GuardFinding } from "./finding.ts";

/** A frozen copy of a spec: `<package>/spec/released/<version>/<name>.schema.json`. */
function isReleasedSpecFile(file: string): boolean {
  return /(?:^|\/)spec\/released\/[^/]+\/[^/]+\.schema\.json$/.test(file);
}

/**
 * HAL-1664: a released spec file never changes. A pull request may add one
 * (`pnpm version:sync` does) but not change or delete one of the merge
 * base's. No decision note can allow it: a released API is a promise, and
 * the way to change it is a new release.
 */
export function checkReleasedSpecs({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  for (const file of base.files.filter(isReleasedSpecFile).sort()) {
    const change = changeOf(file, base, head);
    if (change !== undefined) {
      findings.push({
        subject: undefined,
        file,
        message: `The released spec ${file} was ${change}. A released spec never changes; release the change under a new version.`,
      });
    }
  }
  return findings;
}
