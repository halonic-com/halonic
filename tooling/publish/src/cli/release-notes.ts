import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  changelogHistory,
  previewRelease,
  previousPreview,
  type ReleaseNote,
} from "../release-notes.ts";

/**
 * Used by the release and preview workflows (HAL-19542): writes into <dir> the release notes for
 * the GitHub release and latest.json, where the app's update dialog reads them:
 *   notes.md            this build's own notes, latest.json's `notes`
 *   release-notes.json  this build's and older versions' notes, newest first, latest.json's
 *                       `halonic.releaseNotes`, so an install that skipped versions shows them all
 *
 *   node release-notes.ts changelog <version|latest> <dir>
 *     From apps/studio/CHANGELOG.md. Fails when it has no notes for the version, so a release
 *     never goes out without them.
 *   node release-notes.ts preview <version> <commit> <dir> [<previous latest.json>]
 *     The app's changesets merged since the previous preview's source commit (or, without one,
 *     since the newest stable tag), then the previous preview's list. Needs the history and the
 *     tags (a clone with --filter=blob:none is enough), with <commit> checked out: the changesets
 *     are read from the files, since a partial clone fetches old ones one by one.
 */
const [mode, ...args] = process.argv.slice(2);

function git(gitArgs: string[]): string {
  return execFileSync("git", gitArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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

/** Whether `commit` is in this clone and before `head`; says why not in the log. */
function isAncestor(commit: string, head: string): boolean {
  try {
    git(["merge-base", "--is-ancestor", commit, head]);
    return true;
  } catch (error) {
    console.log(
      `::warning::The previous preview's commit ${commit} isn't before ${head} (${String(error)}); its notes list starts again.`,
    );
    return false;
  }
}

function changelogRun(version: string): { own: string; history: ReleaseNote[] } {
  const history = changelogHistory(readFileSync("apps/studio/CHANGELOG.md", "utf8"), version);
  const own = history[0];
  if (own === undefined) {
    throw new Error(
      `apps/studio/CHANGELOG.md has no notes under "## ${version}". Run the release pull request first.`,
    );
  }
  return { own: own.notes, history };
}

function previewRun(version: string, head: string, previousPath: string | undefined) {
  const previous =
    previousPath !== undefined && existsSync(previousPath)
      ? previousPreview(JSON.parse(readFileSync(previousPath, "utf8")))
      : undefined;
  const chained = previous !== undefined && isAncestor(previous.source, head);
  const tag = newestStableTag();
  const base = chained ? previous.source : git(["merge-base", head, tag]).trim();
  const since = chained ? previous.version : tag.slice(1);
  return previewRelease(
    version,
    changesetsSince(base, head),
    since,
    chained ? previous.releaseNotes : [],
  );
}

function run(): { own: string; history: ReleaseNote[]; dir: string } {
  if (mode === "changelog" && args.length === 2) {
    const [version = "", dir = ""] = args;
    return { ...changelogRun(version), dir };
  }
  if (mode === "preview" && (args.length === 3 || args.length === 4)) {
    const [version = "", head = "", dir = "", previous] = args;
    return { ...previewRun(version, head, previous), dir };
  }
  throw new Error(
    "Usage: release-notes.ts changelog <version|latest> <dir> | preview <version> <commit> <dir> [<previous latest.json>]",
  );
}

const { own, history, dir } = run();
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "notes.md"), `${own}\n`);
writeFileSync(join(dir, "release-notes.json"), `${JSON.stringify(history, null, 2)}\n`);
console.log(own);
console.log(`release-notes.json: ${history.map((note) => note.version).join(", ") || "none"}`);
