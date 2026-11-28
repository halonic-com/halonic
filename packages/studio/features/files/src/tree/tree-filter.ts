// The chips over Code's file tree (`files.code-list-chips`): which files the tree lists. Kept out
// of the view, so the rule is tested without drawing the tree.

import type { FilesListing } from "../files-host.ts";

/** What the tree lists: every file, or only the files with a problem. */
export type TreeFilter = "all" | "problems";

/** Whether the file at `path` has an error or a warning in the listing's marks. */
function hasProblem(listing: FilesListing, path: string): boolean {
  const marks = listing.marks.get(path);
  return (marks?.errors ?? 0) > 0 || (marks?.warnings ?? 0) > 0;
}

/**
 * The listing the tree draws for a filter: the whole listing for "all", and for "problems" only
 * the files with an error or a warning, which keep their marks, so their folders add them up as
 * before. The same listing comes back for "all", so the tree isn't built again.
 */
export function filteredListing(listing: FilesListing, filter: TreeFilter): FilesListing {
  if (filter === "all") return listing;
  return { ...listing, paths: listing.paths.filter((path) => hasProblem(listing, path)) };
}
