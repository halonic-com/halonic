import { branchPath, type PullDetails } from "../pr-tools/pr-status.ts";
import type { PullFacts, Reason } from "./decide.ts";
import { pullKey } from "./facts.ts";
import type { GitHubGet } from "./github.ts";

/**
 * The files a conflicting pull request most likely conflicts in, for the
 * wake comment (HAL-17922), so the woken author knows where to look before
 * fetching anything.
 */
export type ConflictFiles = (pull: PullFacts) => Promise<readonly string[]>;

/** One changed file of a compare, as the REST API lists it. */
interface CompareFile {
  readonly filename?: string;
  readonly previous_filename?: string;
}

/** Each file's names, its old one too when it was renamed. */
function names(files: readonly CompareFile[] | undefined): Set<string> {
  return new Set(
    (files ?? []).flatMap((file) =>
      [file.filename, file.previous_filename].filter((name) => name !== undefined),
    ),
  );
}

/**
 * The files both sides changed since the pull request branched off: the
 * pull request (base...head) and its base branch (head...base). Git's own
 * conflict list needs a merge the read-only watcher can't run, so this is
 * the closest a GET can get; a file both changed in different places merges
 * cleanly and still shows. Three GET requests, sent only for a conflict
 * the author hasn't heard about.
 */
export function gitHubConflictFiles(get: GitHubGet): ConflictFiles {
  return async ({ repo, number, head }) => {
    const pull = (await get(`/repos/${repo}/pulls/${number}`)) as PullDetails;
    const base = branchPath(pull.base.ref);
    const [ours, theirs] = (await Promise.all([
      get(`/repos/${repo}/compare/${base}...${head}`),
      get(`/repos/${repo}/compare/${head}...${base}`),
    ])) as { files?: CompareFile[] }[];
    const changedOnBase = names(theirs?.files);
    return [...names(ours?.files)].filter((name) => changedOnBase.has(name)).sort();
  };
}

/** The conflicting files of each pull request a conflict reason names, keyed by `pullKey`. */
export type ConflictFileMap = ReadonlyMap<string, readonly string[]>;

/**
 * Reads the files for every conflict among the reasons. A read that fails is
 * logged and left out: the wake still goes, only without the file list.
 */
export async function conflictFilesOf(
  reasons: readonly Reason[],
  read: ConflictFiles | undefined,
  log: (line: string) => void,
): Promise<ConflictFileMap> {
  const found = new Map<string, readonly string[]>();
  if (read === undefined) {
    return found;
  }
  for (const { pull } of reasons.filter((reason) => reason.kind === "conflict")) {
    try {
      found.set(pullKey(pull), await read(pull));
    } catch (error) {
      log(`${pullKey(pull)}: couldn't list its conflicting files: ${(error as Error).message}`);
    }
  }
  return found;
}

/** At most this many files are named; the rest are counted. */
const shownFiles = 10;

/** The sentence that names the files, or nothing when there are none. */
export function conflictFilesText(files: readonly string[] | undefined): string {
  if (files === undefined || files.length === 0) {
    return "";
  }
  const shown = files.slice(0, shownFiles).map((file) => `\`${file}\``);
  const more = files.length > shownFiles ? ` and ${files.length - shownFiles} more` : "";
  return ` Files it and its base both changed since it branched: ${shown.join(", ")}${more}.`;
}
