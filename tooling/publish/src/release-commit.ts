export interface ReleaseCommit {
  readonly sha: string;
  readonly version: string;
}

/** "chore(release): Halonic <version>", with an optional task suffix such as " (HAL-4824)". */
function isReleaseTitle(title: string, version: string): boolean {
  const head = `chore(release): Halonic ${version}`;
  return (
    title === head ||
    (title.startsWith(`${head} (`) && /^ \([A-Z]+-\d+\)$/.test(title.slice(head.length)))
  );
}

/**
 * Finds the merge of a release pull request among the commits of one push.
 * The merge queue can push several commits at once, so the last commit is
 * not always the release. `commits` run oldest first. For each one,
 * `versionAt` gives the app version at that commit and `titlesAt` the
 * titles of the pull requests it came from. A commit is the release when
 * one of those titles is "chore(release): Halonic <version at that
 * commit>" (a task suffix is allowed). Returns the newest such commit, or undefined.
 */
export function findReleaseCommit(
  commits: readonly string[],
  versionAt: (sha: string) => string,
  titlesAt: (sha: string) => readonly string[],
): ReleaseCommit | undefined {
  let found: ReleaseCommit | undefined;
  for (const sha of commits) {
    const version = versionAt(sha);
    if (titlesAt(sha).some((title) => isReleaseTitle(title, version))) {
      found = { sha, version };
    }
  }
  return found;
}

const maxCommits = 50;

/**
 * The commits of one push, oldest first: `before..sha`. A new branch
 * (`before` all zeros or empty), a range git cannot list or an empty range
 * gives just `sha`. Only the newest 50 are kept.
 */
export function commitsOfPush(
  before: string,
  sha: string,
  listRange: (range: string) => readonly string[],
): string[] {
  if (before === "" || /^0+$/.test(before)) return [sha];
  let shas: readonly string[];
  try {
    shas = listRange(`${before}..${sha}`);
  } catch {
    return [sha];
  }
  return shas.length > 0 ? shas.slice(-maxCommits) : [sha];
}
