import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

/** The one package a changeset may name: its changelog is Halonic's changelog. */
export const changelogPackage = "@halonicjs/app-studio";

/** A changeset file, not the folder's README or config. */
const changesetFile = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;
/** A front-matter line `"name": bump`, with or without quotes. */
const packageLine = /^\s*(["']?)([^"':]+)\1\s*:/;

/**
 * Finds the package lines of a changeset's front matter that name another
 * package than the app, as 1-based line numbers with the name.
 *
 * @example
 * findOtherPackages('---\n"halonic": patch\n---\n\nRuns are faster.\n');
 * // [{ line: 2, name: "halonic" }]
 */
export function findOtherPackages(text: string): { line: number; name: string }[] {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return [];
  }
  const found: { line: number; name: string }[] = [];
  for (let index = 1; index < lines.length && lines[index]?.trim() !== "---"; index += 1) {
    const name = packageLine.exec(lines[index] ?? "")?.[2]?.trim();
    if (name !== undefined && name !== changelogPackage) {
      found.push({ line: index + 1, name });
    }
  }
  return found;
}

/**
 * Fails on a changeset that names another package than the Studio app
 * (HAL-14675). Only the app has a version and a changelog; `changeset
 * version` drops the sentence of any other private package without a word,
 * and versions one that has a `version`, so the change would be missing
 * from the release notes.
 */
export function checkChangesets(context: CheckContext): Report {
  const report = new Report("changesets");
  for (const file of context.files.filter((name) => changesetFile.test(name))) {
    for (const { line, name } of findOtherPackages(context.read(file))) {
      report.error(
        file,
        `This changeset names ${name}. Name ${changelogPackage} instead, for the CLI too: its changelog is Halonic's one changelog, and a sentence for any other package is left out of the release notes (.changeset/README.md).`,
        line,
      );
    }
  }
  return report;
}
