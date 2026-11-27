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
 * `minor` lines once turned the planned 0.1.1 into 0.2.0. Raised to `minor`
 * for the 0.2.0 release the board approved on HAL-17109; set it back to
 * `patch` once that release has merged.
 */
export const maxBump: Bump = "minor";

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

/** A line that opens or closes a fenced code block: three or more backticks or tildes. */
const fenceLine = /^\s{0,3}(`{3,}|~{3,})/;
/** An inline code span: a run of backticks, its text, and a run of the same length. */
const codeSpan = /(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)/g;
/** An autolink such as `<https://halonic.dev>` or `<mailto:hello@halonic.dev>`. */
const autolink = /<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>/g;
/** What GitHub's Markdown reads as the start of an HTML tag, and drops. */
const htmlTagStart = /<\/?[A-Za-z]/;

/**
 * Finds the body lines of a changeset with a bare `<word>` outside code spans,
 * fenced code blocks and autolinks, as 1-based line numbers. The front matter
 * is left alone.
 *
 * @example
 * findBarePlaceholders('---\n"@halonicjs/app-studio": patch\n---\n\nShows "<Agent> is typing…".\n');
 * // [5]
 */
export function findBarePlaceholders(text: string): number[] {
  const lines = text.split(/\r?\n/);
  const found: number[] = [];
  let openFence: string | undefined;
  for (let index = bodyStart(lines); index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fence = fenceLine.exec(line)?.[1];
    if (fence !== undefined) {
      openFence = nextFence(openFence, fence);
    } else if (openFence === undefined && hasBareTag(line)) {
      found.push(index + 1);
    }
  }
  return found;
}

/** The index of the first line after the front matter, or 0 without one. */
function bodyStart(lines: readonly string[]): number {
  if (lines[0]?.trim() !== "---") {
    return 0;
  }
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return closing === -1 ? lines.length : closing + 1;
}

/** The fence still open after a fence line: a fence closes on the same character, at least as long. */
function nextFence(openFence: string | undefined, fence: string): string | undefined {
  if (openFence === undefined) {
    return fence;
  }
  return fence[0] === openFence[0] && fence.length >= openFence.length ? undefined : openFence;
}

/** Whether a line has a tag start once its code spans and autolinks are taken out. */
function hasBareTag(line: string): boolean {
  return htmlTagStart.test(line.replace(codeSpan, "").replace(autolink, ""));
}

/**
 * Fails on a changeset that names another package than the Studio app
 * (HAL-14675), or asks for a bigger version step than `maxBump`
 * (HAL-14730). Only the app has a version and a changelog; `changeset
 * version` drops the sentence of any other private package without a word,
 * and versions one that has a `version`, so the change would be missing
 * from the release notes. A `minor` changes the next release's version,
 * which is the board's decision.
 *
 * It also fails on a bare `<word>` in a changeset's text (HAL-19604): the
 * release notes copy the changelog unescaped into the GitHub release and
 * `latest.json`, and GitHub drops `<Agent>` as an HTML tag, so
 * `"<Agent> is typing…"` reads `" is typing…"` there.
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
    for (const line of findBarePlaceholders(text)) {
      report.error(
        file,
        `This changeset in ${file} has a bare <…> on line ${line}, which the GitHub release page drops as an HTML tag. Write placeholders as {name} (as the requirements do, e.g. remote.phone-notification-lock-screen uses {computer}) or put the command in backticks.`,
        line,
      );
    }
  }
  return report;
}
