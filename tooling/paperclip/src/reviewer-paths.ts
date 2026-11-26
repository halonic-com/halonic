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
  // Julian doesn't approve a change to his own scope, nor to the code that counts his and Nora's approvals.
  "tooling/paperclip/requirements/reviewer-paths.md",
  "tooling/paperclip/src/merge-control/approval.ts",
  "tooling/paperclip/src/merge-control/signed.ts",
  "tooling/paperclip/src/pr-tools/approvals.ts",
  "tooling/paperclip/requirements/routine-review.md",
  "tooling/paperclip/src/routine-review.test.ts",
  // What the live Merger's loader needs from them (HAL-18282).
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
  // A prefix, not a folder: this file, its tests and any file split off next to it (HAL-19246).
  "tooling/paperclip/src/reviewer-paths",
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

/**
 * Julian approves at most this many changed lines (HAL-18459); tests,
 * Markdown and wording files don't count toward it.
 */
export const julianLineLimit = 1500;

/** The engine's kernel and the event types: Liam reviews bigger changes to them at any size limit. */
export const coreFolders: readonly string[] = [
  "packages/core/engine/src/kernel/",
  "packages/core/events/",
];

/** Julian approves at most this many changed lines in `coreFolders` (HAL-18459). */
export const coreLineLimit = 800;

function isCorePath(path: string): boolean {
  return coreFolders.some((folder) => path.startsWith(folder));
}

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

/** What the rebase-only rule needs to know about a pull request: all its changed files, and its branch. */
export interface ReapprovedPull {
  readonly files: readonly string[];
  readonly branch: string;
}

/**
 * Why Julian's "re-approved on head `<new>` (rebase only, range-diff vs
 * `<old>`)" can't stand in for Liam's approval of `<old>` on this pull
 * request, or null when it can (HAL-18459): on any pull request, Liam's
 * paths and size included, except a security one by its paths, a release
 * one and Julian's own. The Agent tools plugin and the Merger's gate both
 * call this, so they count the same re-approvals.
 */
export function julianRebaseRefusal(pull: ReapprovedPull): string | null {
  if (pull.branch.startsWith("changeset-release/")) {
    return "a release pull request";
  }
  if (pull.branch.startsWith("julian/")) {
    return "Julian's own pull request";
  }
  const security = pull.files.find(isSecurityPath);
  if (security !== undefined) {
    return `a security pull request by its paths (${security})`;
  }
  return null;
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
  /**
   * Changed lines (additions plus deletions) per file. Without a file's
   * count, the line limits use the whole pull request's `changedLines`.
   */
  readonly fileLines?: Readonly<Record<string, number>>;
}

/**
 * Changed lines in the pull request's code files that `inScope` picks; tests,
 * Markdown and wording don't count. When a picked file's count is missing,
 * the whole pull request's lines stand in for them, which can only route
 * to Liam more often, never less.
 */
function codeLines(pull: RoutedPull, inScope: (path: string) => boolean): number {
  const picked = pull.files.filter((path) => inScope(path) && !isWordsOnly(path));
  if (picked.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const path of picked) {
    const lines = pull.fileLines?.[path];
    if (lines === undefined) {
      return pull.changedLines;
    }
    sum += lines;
  }
  return sum;
}

/**
 * Why the pull request is too big for Julian (HAL-18459), or undefined when
 * it isn't: more than `julianLineLimit` changed lines of code, or more than
 * `coreLineLimit` of them in `coreFolders`.
 */
export function overLineLimit(pull: RoutedPull): string | undefined {
  const lines = codeLines(pull, () => true);
  if (lines > julianLineLimit) {
    return `${lines} changed lines outside tests, Markdown and wording (limit ${julianLineLimit})`;
  }
  const coreLines = codeLines(pull, isCorePath);
  if (coreLines > coreLineLimit) {
    return `${coreLines} changed lines in the kernel or the event types (limit ${coreLineLimit})`;
  }
  return undefined;
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

/** Whether only the code reviewer may approve: Julian's limits (HAL-14809, HAL-18459) don't fit. */
function needsCodeReviewer(pull: RoutedPull): boolean {
  return (
    pull.sensitive ||
    overLineLimit(pull) !== undefined ||
    pull.files.some(isLiamPath) ||
    isLiamPackageChange(pull)
  );
}

/**
 * Folders the routine reviewer doesn't approve alone, on top of the code
 * reviewer's paths (the board's decision on HAL-18424, 26 Nov): the core
 * building blocks, the host and the spec helper the guard runs on.
 */
export const routineExcludedFolders: readonly string[] = [
  "packages/core/",
  "packages/host/",
  "packages/testing/spec/",
];

/** A package's public interface: what its `src/index.ts` exports. */
function isPublicInterface(path: string): boolean {
  return /(^|\/)src\/index\.[cm]?tsx?$/.test(path);
}

/**
 * Why the routine reviewer (Nora, HAL-19246) can't approve this pull request
 * alone, or null when it can: it fits the second reviewer's limits and
 * touches none of `routineExcludedFolders` and no public interface. A new
 * package already needs the code reviewer (its `package.json` has no base).
 * The PR watcher, the Agent tools plugin and the Merger's gate all call
 * this, so they count the same approvals.
 */
export function routineRefusal(pull: RoutedPull): string | null {
  if (needsCodeReviewer(pull)) {
    return "outside the second reviewer's limits";
  }
  const excluded = pull.files.find((path) =>
    routineExcludedFolders.some((folder) => path.startsWith(folder)),
  );
  if (excluded !== undefined) {
    return `touches ${excluded}`;
  }
  const publicInterface = pull.files.find(isPublicInterface);
  if (publicInterface !== undefined) {
    return `changes a public interface (${publicInterface})`;
  }
  return null;
}

/** The roles that review a pull request on `halonic`, narrowest first. */
export type ReviewRole = "routine-reviewer" | "second-reviewer" | "code-reviewer";

/**
 * The role that reviews a pull request: `routine-reviewer` when the routine
 * reviewer may approve it alone (`routineRefusal`, HAL-19246),
 * `second-reviewer` when it fits the second reviewer's limits (Julian's,
 * HAL-14809), otherwise `code-reviewer`. The paths, words and sizes stay
 * here; who covers each role comes from the routing (`routing.ts`).
 */
export function reviewerRoleFor(pull: RoutedPull): ReviewRole {
  if (needsCodeReviewer(pull)) {
    return "code-reviewer";
  }
  return routineRefusal(pull) === null ? "routine-reviewer" : "second-reviewer";
}

/**
 * The agent who reviews a pull request: its role (`reviewerRoleFor`),
 * covered by the person the routing names. Without a routing that is
 * `julian` or `liam`, as before (the routine reviewer's role stays with
 * Julian until Nora runs); a refused routing is no routing.
 */
export function reviewerFor(pull: RoutedPull): "julian" | "liam";
export function reviewerFor(pull: RoutedPull, routing: Routing | undefined): string;
export function reviewerFor(pull: RoutedPull, routing?: Routing): string {
  return personFor(reviewerRoleFor(pull), routing);
}
