/**
 * Which reviewer a pull request goes to on `halonic` (Liam, HAL-14809). This
 * is the one path list: the PR watcher, the reviewer-routing check and any
 * other script that routes work import it from here, so they can't drift
 * apart.
 */
import type { Routing } from "@halonicjs/format";
import { personFor } from "./routing.ts";

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
  // What the live Merger's loader needs from them (HAL-18282).
  "tooling/paperclip/src/reviewer-paths-standalone.test.ts",
  "tooling/paperclip/requirements/reviewer-paths-standalone.md",
  // Who covers each role: the routing is a trust root (HAL-17982).
  "tooling/paperclip/src/routing.ts",
  "tooling/paperclip/src/routing-load.ts",
  "tooling/paperclip/src/routing.test.ts",
  "tooling/paperclip/requirements/reviewer-routing.md",
  "packages/core/format/src/snapshot/routing.ts",
  "packages/core/format/requirements/workspace-routing.md",
  // The Paperclip provider's fixed request list: a new entry widens what the board key may do (HAL-17467).
  "packages/adapters/paperclip-client/src/requests.ts",
  // Its sign-in list: starting a sign-in makes a board key (board exception, HAL-17439).
  "packages/adapters/paperclip-client/src/sign-in-requests.ts",
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
  // The router's provider catalog and hard rules change what a run may do (HAL-16998).
  "packages/host/router/",
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
export const julianLineLimit = 1200;

/**
 * Top-level `package.json` fields that publish, install or pin something: a
 * change anywhere inside one is Liam's.
 */
export const liamPackageFields: readonly string[] = [
  "version",
  "private",
  "publishConfig",
  "bin",
  "packageManager",
  "engines",
  "devEngines",
  "pnpm",
];

/** Scripts npm or pnpm run on install or publish: a change to one under `scripts` is Liam's. */
export const liamPackageScripts: readonly string[] = [
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

/**
 * A file that only holds words: tests, Markdown, and wording (the CLI's
 * `messages/`, `*-words.ts`). Only the CLI's `messages/` folder counts, so a
 * future `messages/` folder of code (an IPC protocol, say) keeps the word rule.
 */
function isWordsOnly(path: string): boolean {
  return (
    isTestPath(path) ||
    path.endsWith(".md") ||
    path.startsWith("apps/cli/src/messages/") ||
    /(^|[/-])words\.[jt]sx?$/.test(path)
  );
}

/** A code path with one of `liamWords` in it. */
function hasLiamWord(path: string): boolean {
  if (isWordsOnly(path)) {
    return false;
  }
  const lower = path.toLowerCase();
  return liamWords.some((word) => lower.includes(word));
}

/** Whether a changed file is on Liam's paths. */
export function isLiamPath(path: string): boolean {
  return (
    liamFiles.includes(path) ||
    liamFolders.some((folder) => path.startsWith(folder)) ||
    hasLiamWord(path)
  );
}

/**
 * Whether a changed file makes a pull request a security one by its paths
 * (HAL-14809): a code path with one of `liamWords`, `docs/security/` or
 * `SECURITY.md`. Such a pull request keeps its own gate, so Julian's
 * rebase-only re-approval doesn't apply to it (HAL-17901).
 */
export function isSecurityPath(path: string): boolean {
  return path === "SECURITY.md" || path.startsWith("docs/security/") || hasLiamWord(path);
}

/** A `package.json`'s text at the pull request's merge base and head; `null` where it doesn't exist. */
export interface ManifestChange {
  readonly before: string | null;
  readonly after: string | null;
}

type Manifest = Readonly<Record<string, unknown>>;

function isPlainObject(value: unknown): value is Manifest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The parsed manifest; an absent file is empty, and text that isn't a JSON object is undefined. */
function parseManifest(text: string | null): Manifest | undefined {
  if (text === null) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    // Not JSON: the caller can't tell what changed, so it counts as touched.
    return undefined;
  }
}

/**
 * The value as JSON with every object's keys sorted, so reordering keys isn't
 * a change. A missing field gives `undefined`, which equals only another
 * missing field.
 */
function canonicalJson(value: unknown): string | undefined {
  const sorted = (inner: unknown): unknown => {
    if (Array.isArray(inner)) {
      return inner.map(sorted);
    }
    if (isPlainObject(inner)) {
      return Object.fromEntries(
        Object.keys(inner)
          .sort()
          .map((key) => [key, sorted(inner[key])]),
      );
    }
    return inner;
  };
  return JSON.stringify(sorted(value));
}

function sameValue(before: unknown, after: unknown): boolean {
  return canonicalJson(before) === canonicalJson(after);
}

function scriptsOf(manifest: Manifest): Manifest {
  const scripts = manifest["scripts"];
  return isPlainObject(scripts) ? scripts : {};
}

/**
 * Whether a package's `package.json` changes one of `liamPackageFields`
 * (anywhere inside it) or `liamPackageScripts`. It compares the parsed
 * manifests, not diff lines: a change inside `publishConfig` shows only the
 * inner key in a diff (Julian's finding on #5059). Without both sides, or
 * when one isn't a JSON object, we can't tell, so it counts as touched.
 */
export function touchesPackageFields(change: ManifestChange | undefined): boolean {
  if (change === undefined) {
    return true;
  }
  const before = parseManifest(change.before);
  const after = parseManifest(change.after);
  if (before === undefined || after === undefined) {
    return true;
  }
  return (
    liamPackageFields.some((field) => !sameValue(before[field], after[field])) ||
    liamPackageScripts.some((name) => !sameValue(scriptsOf(before)[name], scriptsOf(after)[name]))
  );
}

/** What routing needs to know about a pull request. */
export interface RoutedPull {
  readonly files: readonly string[];
  readonly changedLines: number;
  /** A security or release PR, or one that changes what a run may do: the author says so. */
  readonly sensitive: boolean;
  /** Each changed `package.json` at base and head, by path; a missing one counts as touching Liam's fields. */
  readonly manifests?: Readonly<Record<string, ManifestChange>>;
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
    manifests.some((path) => touchesPackageFields(pull.manifests?.[path]))
  );
}

/**
 * The role that reviews a pull request: `second-reviewer` when it fits all
 * of the second reviewer's limits (Julian's, HAL-14809), otherwise
 * `code-reviewer`. The paths, words and sizes stay here; who covers each
 * role comes from the routing (`routing.ts`).
 */
export function reviewerRoleFor(pull: RoutedPull): "second-reviewer" | "code-reviewer" {
  const overLimit =
    pull.changedLines > julianLineLimit &&
    !pull.files.every((path) => isTestPath(path) || path.endsWith(".md"));
  if (pull.sensitive || overLimit || pull.files.some(isLiamPath) || isLiamPackageChange(pull)) {
    return "code-reviewer";
  }
  return "second-reviewer";
}

/**
 * The agent who reviews a pull request: its role (`reviewerRoleFor`),
 * covered by the person the routing names. Without a routing that is
 * `julian` or `liam`, as before; a refused routing is no routing.
 */
export function reviewerFor(pull: RoutedPull): "julian" | "liam";
export function reviewerFor(pull: RoutedPull, routing: Routing | undefined): string;
export function reviewerFor(pull: RoutedPull, routing?: Routing): string {
  return personFor(reviewerRoleFor(pull), routing);
}
