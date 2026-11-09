import { semverPattern } from "./app-version.ts";

/** The parts of a semver version that decide its order. Build metadata doesn't. */
interface VersionParts {
  readonly numbers: readonly [number, number, number];
  readonly preRelease: string | undefined;
}

// major.minor.patch, then an optional pre-release after "-". A "+build" part is ignored.
const versionShape = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<preRelease>[^+]+))?/;

function versionParts(version: string): VersionParts {
  const groups = semverPattern.test(version) ? versionShape.exec(version)?.groups : undefined;
  if (groups === undefined) {
    throw new Error(`"${version}" is not a version like "0.1.0".`);
  }
  const numbers = [
    Number(groups["major"]),
    Number(groups["minor"]),
    Number(groups["patch"]),
  ] as const;
  return { numbers, preRelease: groups["preRelease"] };
}

/**
 * Orders two semver versions: negative when `a` comes first, positive when
 * `b` does, 0 when they are equal. A pre-release comes before its release
 * (`0.2.0-rc.1` < `0.2.0`); two pre-releases of one version compare as text,
 * which is enough for the `rc.N` names changesets writes.
 *
 * @throws when either isn't a semver version
 */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (const [index, number] of left.numbers.entries()) {
    const difference = number - (right.numbers[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  if (left.preRelease === right.preRelease) {
    return 0;
  }
  if (left.preRelease === undefined) {
    return 1;
  }
  if (right.preRelease === undefined) {
    return -1;
  }
  return left.preRelease < right.preRelease ? -1 : 1;
}
