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

/** One version's release notes, as latest.json lists them in `halonic.releaseNotes`. */
export interface ReleaseNote {
  readonly version: string;
  readonly notes: string;
}

/**
 * The most characters `halonic.releaseNotes` holds over all its versions, and the most versions.
 * The app shows the notes of every version newer than the one installed (HAL-19542), so the list
 * reaches back as far as it can without making each update check heavy.
 */
export const historyMaxLength = 100_000;
export const historyMaxVersions = 50;

/**
 * Every version's release notes in the app's CHANGELOG.md, newest first as the file lists them:
 * the text under each "## <version>" heading. The kind headings and the commit hashes changesets
 * adds are left out, so the text reads the same in the GitHub release and in the update dialog.
 * Each is cut by {@link fitNotes}; a version with no text is left out.
 */
export function changelogNotes(changelog: string): ReleaseNote[] {
  const notes: ReleaseNote[] = [];
  let version: string | undefined;
  let lines: string[] = [];
  const close = () => {
    const text = squeezeBlankLines(lines).trim();
    if (version !== undefined && text !== "") notes.push({ version, notes: fitNotes(text) });
  };
  for (const line of changelog.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      close();
      version = line.slice(3).trim();
      lines = [];
    } else if (!kindHeading.test(line)) {
      lines.push(line.replace(entryHash, "- "));
    }
  }
  close();
  return notes;
}

/**
 * The release notes of one version from the app's CHANGELOG.md (see {@link changelogNotes}).
 * `version` "latest" takes the newest section, for dry runs whose version has none. Returns
 * undefined when there is no such section or it holds no text.
 */
export function changelogSection(changelog: string, version: string): string | undefined {
  return changelogHistory(changelog, version)[0]?.notes;
}

/**
 * The notes of `version` and of every older version in the changelog, newest first, cut by
 * {@link limitHistory}: latest.json's `halonic.releaseNotes` for a release. Empty when the
 * changelog has no notes for `version` ("latest" takes the newest).
 */
export function changelogHistory(changelog: string, version: string): ReleaseNote[] {
  const all = changelogNotes(changelog);
  const start = version === "latest" ? 0 : all.findIndex((note) => note.version === version);
  return start === -1 ? [] : limitHistory(all.slice(start));
}

/**
 * The newest notes of `history` that fit in {@link historyMaxLength} characters and
 * {@link historyMaxVersions} versions. The newest one is always kept.
 */
export function limitHistory(history: readonly ReleaseNote[]): ReleaseNote[] {
  const kept: ReleaseNote[] = [];
  let length = 0;
  for (const note of history) {
    length += note.notes.length;
    if (kept.length > 0 && (length > historyMaxLength || kept.length === historyMaxVersions)) break;
    kept.push(note);
  }
  return kept;
}

/**
 * A preview's `halonic.releaseNotes`: its own notes, then the list in the previous preview's
 * latest.json, which is read as untrusted JSON: entries that aren't a version and its notes, and
 * any for this version or a newer-listed duplicate, are left out. Cut by {@link limitHistory}.
 */
export function chainHistory(own: ReleaseNote, previous: unknown): ReleaseNote[] {
  const seen = new Set([own.version]);
  const older: ReleaseNote[] = [];
  for (const entry of Array.isArray(previous) ? previous : []) {
    if (!isReleaseNote(entry) || seen.has(entry.version)) continue;
    seen.add(entry.version);
    older.push({ version: entry.version, notes: fitNotes(entry.notes) });
  }
  return limitHistory([own, ...older]);
}

function isReleaseNote(entry: unknown): entry is ReleaseNote {
  if (typeof entry !== "object" || entry === null) return false;
  const { version, notes } = entry as Record<string, unknown>;
  return typeof version === "string" && version !== "" && typeof notes === "string" && notes !== "";
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
 * The release notes of a preview build: the app's changes since `since` (the previous preview, or
 * the newest stable release for the first one), newest first, from the changeset files merged
 * since. `changesets` are the files' texts, newest first. Cut by {@link fitNotes}. Returns
 * undefined when no changeset names the app.
 */
export function previewNotes(changesets: readonly string[], since: string): string | undefined {
  const entries = changesets.flatMap((text) => changesetEntry(text) ?? []);
  if (entries.length === 0) return undefined;
  return fitNotes([`Changes since ${since}, newest first:`, "", ...entries].join("\n"));
}
