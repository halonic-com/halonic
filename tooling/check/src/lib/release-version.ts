/**
 * Halonic never ships as 1.0.0 (the board, HAL-19109): on npm, `halonic`
 * 1.0.0 is the old placeholder, and npm never lets a version be published
 * twice. The first real 1.x is 1.0.1 or 1.1.0. No imports, so the release
 * workflow can run this before it installs anything.
 */

/** The version Halonic never releases. */
export const refusedVersion = "1.0.0";

/** 1.0.0 or one of its pre-releases or builds, such as 1.0.0-rc.1. */
const refused = /^1\.0\.0(?:[-+].*)?$/;

/** 1.0.0 as a whole version inside a tag or branch name, such as `v1.0.0` or `release/halonic-1.0.0`. */
const refusedInName = /(?:^|[^0-9.])v?1\.0\.0(?![0-9]|\.[0-9])/;

/** True for 1.0.0 and its pre-releases and builds. */
export function isRefusedVersion(version: string): boolean {
  return refused.test(version);
}

/** What the release workflow is asked to release, as it reads it. */
export interface ReleaseInput {
  /** The tag to release, such as `v0.1.1`. */
  readonly tag: string;
  /** The branch or tag the run started from (`github.ref_name`). */
  readonly ref: string;
  /** The version in `apps/studio/package.json` at that commit, if any. */
  readonly appVersion?: string;
}

/** Why the release must stop because it would be 1.0.0, or undefined when it may go on. */
export function refusedReleaseReason(input: ReleaseInput): string | undefined {
  const because = (where: string): string =>
    `${where} names Halonic ${refusedVersion}. Halonic never ships as ${refusedVersion}: on npm it is the old placeholder and cannot be published again. Release 1.0.1 or 1.1.0 instead (HAL-19109).`;
  if (refusedInName.test(input.tag)) {
    return because(`The tag '${input.tag}'`);
  }
  if (refusedInName.test(input.ref)) {
    return because(`The branch or tag '${input.ref}'`);
  }
  if (input.appVersion !== undefined && isRefusedVersion(input.appVersion)) {
    return because(`apps/studio/package.json (version ${input.appVersion})`);
  }
  return undefined;
}
