import { execFileSync } from "node:child_process";
import { gitObjects } from "../guard/git-objects.ts";
import type { GitObjects } from "../guard/signatures.ts";
import { isRequirementFile, versionPattern } from "./requirements.ts";

/** The requirements a release tag holds: their file paths and their IDs. */
export interface ReleasedRequirements {
  readonly files: ReadonlySet<string>;
  readonly ids: ReadonlySet<string>;
}

/** The release tags (`v<version>`) of a checkout. */
export interface ReleaseTags {
  /** Whether the checkout has any `v*` tag; a shallow clone often has none. */
  readonly any: boolean;
  /** The requirements at tag `v<version>`, or `undefined` when there is no such tag. */
  requirementsAt(version: string): ReleasedRequirements | undefined;
}

/**
 * Reads the release tags of the git repo at `root` through git's object
 * commands only, like the note guard: no network, no checkout. A folder
 * that isn't a git repo has no tags.
 */
export function releaseTags(root: string): ReleaseTags {
  const git = (...args: string[]): string | undefined => {
    try {
      return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      return undefined;
    }
  };
  const objects = gitObjects(root);
  const read = new Map<string, ReleasedRequirements | undefined>();
  const requirementsAt = (version: string): ReleasedRequirements | undefined => {
    // Only what `Since` accepts, so a version never reads as an option or a ref expression.
    if (!versionPattern.test(version)) {
      return undefined;
    }
    if (!read.has(version)) {
      const commit = git("rev-parse", "--verify", "--quiet", `refs/tags/v${version}^{commit}`);
      read.set(version, commit === undefined ? undefined : requirementsIn(objects, commit.trim()));
    }
    return read.get(version);
  };
  const anyTag = git("for-each-ref", "--count=1", "--format=%(refname)", "refs/tags/v*");
  return { any: (anyTag ?? "").trim() !== "", requirementsAt };
}

/** The requirement files at `commit` and the IDs their `# <id>` headings give. */
function requirementsIn(objects: GitObjects, commit: string): ReleasedRequirements {
  const files = objects.listFiles(commit).filter(isRequirementFile);
  const ids = new Set<string>();
  for (const text of objects.readFiles(commit, files).values()) {
    const id = /^# (\S+)\s*$/.exec(text.split("\n", 1)[0] ?? "")?.[1];
    if (id !== undefined) {
      ids.add(id);
    }
  }
  return { files: new Set(files), ids };
}
