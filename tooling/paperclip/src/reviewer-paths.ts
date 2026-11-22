/**
 * Which reviewer a pull request goes to on `halonic` (Liam, HAL-14809). This
 * is the one path list: the PR watcher, the reviewer-routing check and any
 * other script that routes work import it from here, so they can't drift
 * apart.
 */

/** Exact files only Liam reviews. The root `package.json` counts too. */
export const liamFiles: readonly string[] = [
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "package.json",
  "turbo.json",
  "biome.json",
  ".changeset/config.json",
  "SECURITY.md",
  // Julian doesn't approve a change to his own scope.
  "tooling/paperclip/src/reviewer-paths.ts",
  "tooling/paperclip/src/reviewer-paths.test.ts",
  "tooling/paperclip/requirements/reviewer-paths.md",
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

/** Words that make a code path Liam's; tests, Markdown and wording files don't count. */
export const liamWords: readonly string[] = [
  "sandbox",
  "secret",
  "sign-in",
  "oauth",
  "keychain",
  "trust",
];

/** Julian approves at most this many changed lines, unless it's only tests and Markdown. */
export const julianLineLimit = 800;

/** `package.json` fields that publish, install or pin something: a change to one is Liam's. */
export const liamPackageFields: readonly string[] = [
  "version",
  "private",
  "publishConfig",
  "bin",
  "packageManager",
  "engines",
  "devEngines",
  "pnpm",
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepack",
  "postpack",
  "prepublish",
  "prepublishOnly",
  "publish",
  "postpublish",
];

/** A test, a test fixture or a golden file. */
export function isTestPath(path: string): boolean {
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(^|\/)(test|tests|fixtures|golden|__snapshots__)\//.test(path)
  );
}

/** A file that only holds words: tests, Markdown, and wording (`messages/`, `*-words.ts`). */
function isWordsOnly(path: string): boolean {
  return (
    isTestPath(path) ||
    path.endsWith(".md") ||
    /(^|\/)messages\//.test(path) ||
    /(^|[/-])words\.[jt]sx?$/.test(path)
  );
}

/** Whether a changed file is on Liam's paths. */
export function isLiamPath(path: string): boolean {
  if (liamFiles.includes(path) || liamFolders.some((folder) => path.startsWith(folder))) {
    return true;
  }
  if (isWordsOnly(path)) {
    return false;
  }
  const lower = path.toLowerCase();
  return liamWords.some((word) => lower.includes(word));
}

/**
 * Whether a package's `package.json` diff touches one of `liamPackageFields`.
 * Without the diff we can't tell, so it counts as touched.
 */
export function touchesPackageFields(patch: string | undefined): boolean {
  if (patch === undefined) {
    return true;
  }
  const changed = patch.split("\n").filter((line) => /^[+-](?![+-])/.test(line));
  return changed.some((line) =>
    liamPackageFields.some((field) => new RegExp(`^[+-]\\s*"${field}"\\s*:`).test(line)),
  );
}

/** What routing needs to know about a pull request. */
export interface RoutedPull {
  readonly files: readonly string[];
  readonly changedLines: number;
  /** A security or release PR, or one that changes what a run may do: the author says so. */
  readonly sensitive: boolean;
  /** Each changed `package.json`'s diff, by path; a missing one counts as touching Liam's fields. */
  readonly patches?: Readonly<Record<string, string>>;
}

/**
 * A package's `package.json` is Julian's when the lockfile doesn't change (so
 * no dependency is added, removed or moved) and none of Liam's fields do.
 */
function isLiamPackageChange(pull: RoutedPull): boolean {
  const manifests = pull.files.filter((path) => path.endsWith("/package.json"));
  if (manifests.length === 0) {
    return false;
  }
  return (
    pull.files.includes("pnpm-lock.yaml") ||
    manifests.some((path) => touchesPackageFields(pull.patches?.[path]))
  );
}

/** `julian` when the pull request fits all of Julian's limits, otherwise `liam`. */
export function reviewerFor(pull: RoutedPull): "julian" | "liam" {
  const overLimit =
    pull.changedLines > julianLineLimit &&
    !pull.files.every((path) => isTestPath(path) || path.endsWith(".md"));
  if (pull.sensitive || overLimit || pull.files.some(isLiamPath) || isLiamPackageChange(pull)) {
    return "liam";
  }
  return "julian";
}
