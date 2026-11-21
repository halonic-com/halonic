import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

/** The one package a changeset may name: its changelog is Halonic's changelog. */
export const changelogPackage = "@halonicjs/app-studio";

/** The version steps of a changeset, smallest first. */
const bumps = ["patch", "minor", "major"] as const;
type Bump = (typeof bumps)[number];

/**
 * The biggest version step a changeset may ask for. Raise it only when the
 * board approves a minor release on a release card (HAL-14730): two stray
 * `minor` lines once turned the planned 0.1.1 into 0.2.0.
 */
export const maxBump: Bump = "patch";

/** A changeset file, not the folder's README or config. */
const changesetFile = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;
/** A front-matter line `"name": bump`, with or without quotes. */
const packageLine = /^\s*(["']?)([^"':]+)\1\s*:\s*(\S*)/;

/** The package lines of a changeset's front matter, with 1-based line numbers. */
function releaseLines(text: string): { line: number; name: string; bump: string }[] {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return [];
  }
  const found: { line: number; name: string; bump: string }[] = [];
  for (let index = 1; index < lines.length && lines[index]?.trim() !== "---"; index += 1) {
    const match = packageLine.exec(lines[index] ?? "");
    const name = match?.[2]?.trim();
    if (name !== undefined) {
      found.push({ line: index + 1, name, bump: match?.[3] ?? "" });
    }
  }
  return found;
}

/**
 * Finds the package lines of a changeset's front matter that name another
 * package than the app, as 1-based line numbers with the name.
 *
 * @example
 * findOtherPackages('---\n"halonic": patch\n---\n\nRuns are faster.\n');
 * // [{ line: 2, name: "halonic" }]
 */
export function findOtherPackages(text: string): { line: number; name: string }[] {
  return releaseLines(text)
    .filter(({ name }) => name !== changelogPackage)
    .map(({ line, name }) => ({ line, name }));
}

/**
 * Finds the app's lines in a changeset's front matter that ask for a bigger
 * version step than `maxBump`, as 1-based line numbers with the step. A line
 * that names another package already fails on its name.
 *
 * @example
 * findTooBigBumps('---\n"@halonicjs/app-studio": minor\n---\n\nRuns are faster.\n');
 * // [{ line: 2, bump: "minor" }]
 */
export function findTooBigBumps(text: string): { line: number; bump: string }[] {
  const allowed = bumps.indexOf(maxBump);
  return releaseLines(text)
    .filter(({ name, bump }) => name === changelogPackage && bumps.indexOf(bump as Bump) > allowed)
    .map(({ line, bump }) => ({ line, bump }));
}

/**
 * Fails on a changeset that names another package than the Studio app
 * (HAL-14675), or asks for a bigger version step than `maxBump`
 * (HAL-14730). Only the app has a version and a changelog; `changeset
 * version` drops the sentence of any other private package without a word,
 * and versions one that has a `version`, so the change would be missing
 * from the release notes. A `minor` changes the next release's version,
 * which is the board's decision.
 */
export function checkChangesets(context: CheckContext): Report {
  const report = new Report("changesets");
  for (const file of context.files.filter((name) => changesetFile.test(name))) {
    const text = context.read(file);
    for (const { line, name } of findOtherPackages(text)) {
      report.error(
        file,
        `This changeset names ${name}. Name ${changelogPackage} instead, for the CLI too: its changelog is Halonic's one changelog, and a sentence for any other package is left out of the release notes (.changeset/README.md).`,
        line,
      );
    }
    for (const { line, bump } of findTooBigBumps(text)) {
      report.error(
        file,
        `This changeset in ${file} asks for a ${bump} release. Use ${maxBump} until a ${bump} release is approved: the next version is the board's decision on a release card.`,
        line,
      );
    }
  }
  return report;
}
