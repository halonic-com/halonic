/**
 * Which reviewer a pull request goes to on `halonic` (Liam, HAL-14809). This
 * is the one path list: the PR watcher, the reviewer-routing check and any
 * other script that routes work import it from here, so they can't drift
 * apart.
 */

/** Exact files only Liam reviews. Any `package.json` counts too. */
export const liamFiles: readonly string[] = [
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "biome.json",
  ".changeset/config.json",
  "SECURITY.md",
];

/** Folders whose files only Liam reviews. */
export const liamFolders: readonly string[] = [
  "patches/",
  ".github/",
  "tooling/check/",
  "tooling/publish/",
  "packages/testing/parity/",
  "infra/",
  "apps/studio/src-tauri/",
  "docs/security/",
  "docs/adr/",
];

/** Words that make any path Liam's, except in a changeset's file name. */
export const liamWords: readonly string[] = [
  "sandbox",
  "secret",
  "sign-in",
  "oauth",
  "keychain",
  "trust",
];

/** Julian approves at most this many changed lines (additions plus deletions). */
export const julianLineLimit = 400;

/** Whether a changed file is on Liam's paths. */
export function isLiamPath(path: string): boolean {
  if (liamFiles.includes(path) || path === "package.json" || path.endsWith("/package.json")) {
    return true;
  }
  if (liamFolders.some((folder) => path.startsWith(folder))) {
    return true;
  }
  // A changeset's file name is generated from words, so it doesn't count.
  const checked = /^\.changeset\/[^/]+\.md$/.test(path) ? "" : path.toLowerCase();
  return liamWords.some((word) => checked.includes(word));
}

/** What routing needs to know about a pull request. */
export interface RoutedPull {
  readonly files: readonly string[];
  readonly changedLines: number;
  /** A security or release PR, or one that changes what a run may do: the author says so. */
  readonly sensitive: boolean;
}

/** `julian` when the pull request fits all of Julian's limits, otherwise `liam`. */
export function reviewerFor(pull: RoutedPull): "julian" | "liam" {
  if (pull.sensitive || pull.changedLines > julianLineLimit || pull.files.some(isLiamPath)) {
    return "liam";
  }
  return "julian";
}
