/**
 * The GitHub reading the verdict gate relies on, kept here so a routine
 * review can't change it (HAL-20010): which commenters may review, every
 * page of a list, and a branch name as a request path. `pr-watcher/github.ts`
 * and `pr-tools/pr-status.ts` re-export them.
 */
import type { GitHubGet } from "../pr-watcher/github.ts";

/**
 * Who may ask our authors for changes: the repository's owner, members of
 * its organization and its collaborators. On a public repository anyone else
 * can comment too, and their comments don't wake anyone.
 */
const reviewerAssociations: ReadonlySet<string> = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function byReviewer(item: { readonly author_association?: string }): boolean {
  return reviewerAssociations.has(item.author_association ?? "");
}

/** Every item of a list endpoint, page by page. */
export async function everyPage(get: GitHubGet, path: string): Promise<unknown[]> {
  const items: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const list = (await get(
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    )) as unknown[];
    items.push(...list);
    if (list.length < 100) {
      return items;
    }
  }
}

/**
 * A branch name as a path: each `/`-separated part encoded, so a `?`, `#` or
 * `%` in it can't change which request goes to GitHub. Git refuses `..` in a
 * branch name, so no part resolves upwards.
 */
export function branchPath(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}
