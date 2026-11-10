/**
 * A version in semver's form, such as 0.169.0-alpha.6: three numbers and
 * the pieces of an optional pre-release part. A build part (`+…`) is read
 * but not kept, because it never changes the order.
 */
export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** The pre-release pieces, such as `["alpha", 6]`; empty for a release. */
  readonly prerelease: readonly (string | number)[];
}

// A number without leading zeros, as semver writes them.
const number = "(?:0|[1-9]\\d*)";
// One pre-release piece: a number, or a word of letters, digits and hyphens.
const prereleasePiece = `(?:${number}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
// One build piece: any letters, digits and hyphens.
const buildPiece = "[0-9A-Za-z-]+";

const versionPattern = new RegExp(
  `^(${number})\\.(${number})\\.(${number})` +
    `(?:-(${prereleasePiece}(?:\\.${prereleasePiece})*))?` +
    `(?:\\+${buildPiece}(?:\\.${buildPiece})*)?$`,
);

/**
 * Reads a version from text that is nothing but the version. Finding it in a
 * program's output, such as "codex-cli 0.167.0", is the caller's part.
 *
 * @param text - the version, such as "0.169.0-alpha.6"
 * @returns the version, or `undefined` when the text is anything else
 *
 * @example
 * readVersion("0.169.0-alpha.6"); // { major: 0, minor: 169, patch: 0, prerelease: ["alpha", 6] }
 * readVersion("v0.169.0"); // undefined
 */
export function readVersion(text: string): Version | undefined {
  const match = versionPattern.exec(text);
  if (match === null) {
    return undefined;
  }
  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined ? [] : prerelease.split(".").map(readPrereleasePiece),
  };
}

/** A pre-release piece of digits only is a number; any other is a word. */
function readPrereleasePiece(piece: string): string | number {
  return /^\d+$/.test(piece) ? Number(piece) : piece;
}

/**
 * Writes a version the usual way, such as "0.169.0-alpha.6".
 *
 * @example
 * formatVersion({ major: 2, minor: 1, patch: 321, prerelease: [] }); // "2.1.321"
 */
export function formatVersion(version: Version): string {
  const release = `${version.major}.${version.minor}.${version.patch}`;
  if (version.prerelease.length === 0) {
    return release;
  }
  return `${release}-${version.prerelease.join(".")}`;
}

/**
 * Compares two versions in semver's order.
 *
 * @returns a negative number when `a` comes first, a positive one when `b`
 *   does, and 0 when they are equal
 *
 * @example
 * compareVersions(readVersion("0.167.0-alpha.6")!, readVersion("0.167.0")!); // negative
 */
export function compareVersions(a: Version, b: Version): number {
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.patch - b.patch ||
    comparePrereleases(a.prerelease, b.prerelease)
  );
}

/**
 * Whether `version` is `minimum` or newer.
 *
 * @example
 * isAtLeast(readVersion("0.167.0")!, readVersion("0.166.0")!); // true
 */
export function isAtLeast(version: Version, minimum: Version): boolean {
  return compareVersions(version, minimum) >= 0;
}

/** A release (no pieces) comes after any pre-release of the same version. */
function comparePrereleases(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  if (a.length === 0 || b.length === 0) {
    return b.length - a.length;
  }
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const order = comparePrereleasePieces(a[index] as string | number, b[index] as string | number);
    if (order !== 0) {
      return order;
    }
  }
  return a.length - b.length;
}

/** Numbers by value and before words; words in ASCII order. */
function comparePrereleasePieces(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (typeof a === "number") {
    return -1;
  }
  if (typeof b === "number") {
    return 1;
  }
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
