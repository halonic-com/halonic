import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { changelogSection, previewNotes } from "../release-notes.ts";

/**
 * Used by the release and preview workflows: writes the release notes that go into the GitHub
 * release and into latest.json, where the app's update dialog reads them (HAL-19542).
 *
 *   node release-notes.ts changelog <version|latest> <out>
 *     The version's section of apps/studio/CHANGELOG.md. Fails when it has none, so a release
 *     never goes out without notes.
 *   node release-notes.ts preview <commit> <out>
 *     The app's changesets merged since the newest stable tag, newest first. Needs the history
 *     and the tags (a clone with --filter=blob:none is enough), with <commit> checked out: the
 *     changesets are read from the files, since a partial clone fetches old ones one by one.
 */
const [mode, target, out] = process.argv.slice(2);
if (mode === undefined || target === undefined || out === undefined) {
  throw new Error(
    "Usage: release-notes.ts changelog <version|latest> <out> | preview <commit> <out>",
  );
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The newest tag of a stable release: v<major>.<minor>.<patch>, without a pre-release part. */
function newestStableTag(): string {
  const tag = git(["tag", "--list", "v*", "--sort=-v:refname"])
    .split("\n")
    .find((name) => /^v\d+\.\d+\.\d+$/.test(name));
  if (tag === undefined) throw new Error("No stable release tag (vX.Y.Z) in this clone.");
  return tag;
}

/** The changeset files added between `base` and `head` that the checkout still has, newest first. */
function changesetsSince(base: string, head: string): string[] {
  const added = git([
    "log",
    "--diff-filter=A",
    "--name-only",
    "--format=",
    `${base}..${head}`,
    "--",
    ".changeset",
  ])
    .split("\n")
    .filter((path) => path.endsWith(".md") && path !== ".changeset/README.md");
  const paths = [...new Set(added)].filter((path) => existsSync(path));
  return paths.map((path) => readFileSync(path, "utf8"));
}

function changelogNotes(version: string): string {
  const notes = changelogSection(readFileSync("apps/studio/CHANGELOG.md", "utf8"), version);
  if (notes === undefined) {
    throw new Error(
      `apps/studio/CHANGELOG.md has no notes under "## ${version}". Run the release pull request first.`,
    );
  }
  return notes;
}

function previewNotesAt(head: string): string {
  const tag = newestStableTag();
  const base = git(["merge-base", head, tag]).trim();
  const stable = tag.slice(1);
  return (
    previewNotes(changesetsSince(base, head), stable) ?? `No changes users see since ${stable}.`
  );
}

if (mode !== "preview" && mode !== "changelog") throw new Error(`Unknown mode "${mode}".`);
const notes = mode === "preview" ? previewNotesAt(target) : changelogNotes(target);
writeFileSync(out, `${notes}\n`);
console.log(notes);
