/** The package whose changes users see: the Studio, the desktop app and the CLI. */
const appPackage = "@halonicjs/app-studio";

/**
 * The most characters release notes hold. The update dialog shows them in full, and GitHub takes
 * at most 125,000 in a release's description; 0.1.1's changelog alone has 155,000.
 */
export const notesMaxLength = 20_000;

/** The kind headings `changeset version` writes, which say nothing to a reader. */
const kindHeading = /^### (Major|Minor|Patch) Changes$/;

/** The commit hash `changeset version` puts before each entry: "- 9800bc3: ". */
const entryHash = /^- [0-9a-f]{7,40}: /;

/**
 * The release notes of one version from the app's CHANGELOG.md: the text under its "## <version>"
 * heading, up to the next "## " heading. The kind headings and the commit hashes changesets adds
 * are left out, so the text reads the same in the GitHub release and in the app's update dialog.
 * `version` "latest" takes the newest section, for dry runs whose version has none. Returns
 * undefined when there is no such section or it holds no text.
 */
export function changelogSection(changelog: string, version: string): string | undefined {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    version === "latest" ? line.startsWith("## ") : line.trim() === `## ${version}`,
  );
  if (start === -1) return undefined;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const section = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((line) => !kindHeading.test(line))
    .map((line) => line.replace(entryHash, "- "));
  const text = squeezeBlankLines(section).trim();
  return text === "" ? undefined : fitNotes(text);
}

/**
 * `text` cut to at most {@link notesMaxLength} characters at the start of a list entry, with a
 * last line that counts the entries left out. Text that fits comes back as it is.
 */
export function fitNotes(text: string): string {
  if (text.length <= notesMaxLength) return text;
  // Room for the counting line, so the result stays within the limit.
  const cut = text.lastIndexOf("\n- ", notesMaxLength - 40);
  const kept = cut > 0 ? text.slice(0, cut) : "";
  const left = text.slice(kept.length).match(/^- /gm)?.length ?? 0;
  return `${kept.trimEnd()}\n\nAnd ${left} more ${left === 1 ? "change" : "changes"}.`.trimStart();
}

/** Collapses runs of blank lines, which dropped headings leave behind, into one. */
function squeezeBlankLines(lines: readonly string[]): string {
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "");
}

/**
 * The text of one changeset file when it names the app package, as a list entry: its body after
 * the front matter, with later lines indented under the dash. Returns undefined for a changeset
 * that doesn't name the app (users don't see it) or that has no body.
 */
export function changesetEntry(text: string): string | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (match === null) return undefined;
  const [, frontMatter = "", body = ""] = match;
  if (!frontMatter.includes(`"${appPackage}"`) && !frontMatter.includes(`'${appPackage}'`)) {
    return undefined;
  }
  const trimmed = body.trim();
  if (trimmed === "") return undefined;
  return `- ${trimmed.split(/\r?\n/).join("\n  ")}`;
}

/**
 * The release notes of a preview build: the app's changes since the stable release `stable`,
 * newest first, from the changeset files merged since. `changesets` are the files' texts, newest
 * first. Cut by {@link fitNotes}. Returns undefined when no changeset names the app.
 */
export function previewNotes(changesets: readonly string[], stable: string): string | undefined {
  const entries = changesets.flatMap((text) => changesetEntry(text) ?? []);
  if (entries.length === 0) return undefined;
  return fitNotes([`Changes since ${stable}, newest first:`, "", ...entries].join("\n"));
}
