/**
 * What the routine reviewer (Nora, HAL-19246) never approves alone, on top
 * of the code reviewer's paths: the paths the board kept with Liam and Julian
 * on HAL-18424, and the public interfaces (HAL-19283). `routineRefusal` in
 * `reviewer-paths.ts` applies them. The live Merger loads this file with
 * `reviewer-paths.ts`, so it imports nothing at run time.
 */

/**
 * Folders (and path prefixes) the routine reviewer doesn't approve alone: the core building
 * blocks, the host, the spec helper the guard runs on (the board, HAL-18424),
 * the shared lint, type and test config every package runs on, the agents'
 * own config, and the Merger's rules, tests included (HAL-19283).
 */
export const routineExcludedFolders: readonly string[] = [
  "packages/core/",
  "packages/host/",
  "packages/testing/spec/",
  "tooling/config/",
  "tooling/paperclip/src/merge-control/",
  // The review-verdict recorder and the carry-over the gates will read (HAL-19585), tests included.
  "tooling/paperclip/src/verdicts/",
  "tooling/paperclip/src/plugin/review-verdict-tool",
  // What the verdict gate runs outside `verdicts/` (HAL-20010): which approvals count, the
  // manifests a pull request changes, who reviews it and this file; `verdicts/imports.test.ts` checks.
  "tooling/paperclip/src/pr-tools/approvals.ts",
  "tooling/paperclip/src/pr-tools/manifests.ts",
  "tooling/paperclip/src/reviewer-paths",
  "tooling/paperclip/src/routing.ts",
  "tooling/paperclip/src/task-tools/input.ts",
  // The DCO standing statement CONTRIBUTING.md links to, which covers every halonic-dev commit.
  "docs/legal/",
];

/**
 * File names excluded in any folder (HAL-19283): `.gitattributes`, licence
 * and notice files, plugin manifests, which declare what a plugin may do, and
 * the agents' own config: `.mcp.json`, a `.claude` entry (a folder, a file or
 * a link) and anything in it, line breaks in the name included (Julian's
 * item 7, HAL-19247).
 */
const routineExcludedNames =
  /(^|\/)(\.gitattributes|\.mcp\.json|\.claude(\/[\s\S]*)?|(LICENSE|LICENCE|NOTICE|COPYING)(\.[a-z]+)?|plugin\/manifest\.[cm]?[jt]sx?|[^/]*plugin\.json)$/i;

/**
 * Words that make a code path Liam's; tests, Markdown and wording files don't
 * count for that (`reviewer-paths.ts`). For the routine reviewer they count in
 * tests and docs too, so she never approves a security test alone (HAL-19283).
 */
export const liamWords: readonly string[] = [
  "sandbox",
  "secret",
  "sign-in",
  "oauth",
  "keychain",
  "trust",
];

/** Whether a path names security code, tests and docs included; wording and changeset names don't count. */
function isSecurityNamed(path: string): boolean {
  if (
    path.startsWith(".changeset/") ||
    path.startsWith("apps/cli/src/messages/") ||
    /(^|[/-])words\.[jt]sx?$/.test(path)
  ) {
    return false;
  }
  const lower = path.toLowerCase();
  return liamWords.some((word) => lower.includes(word));
}

/**
 * Whether a changed path keeps the pull request from being a routine review:
 * any file at the root (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.npmrc`,
 * `.mcp.json` among them) or in a root dot-folder such as `.claude/` (but a
 * changeset is routine), the excluded folders and names, and security code
 * with its tests (HAL-19283).
 */
export function isRoutineExcluded(path: string): boolean {
  return (
    !path.includes("/") ||
    (path.startsWith(".") && !path.startsWith(".changeset/")) ||
    routineExcludedFolders.some((folder) => path.startsWith(folder)) ||
    routineExcludedNames.test(path) ||
    isSecurityNamed(path)
  );
}

/** What says who wrote a pull request and whether it is a security or release one. */
export interface PullOrigin {
  readonly branch: string;
  /** Whether the branch is in a fork. */
  readonly crossRepository: boolean;
  readonly labels: readonly string[];
  /** The opener's login; null or missing when GitHub's answer didn't name one. */
  readonly author?: string | null;
}

/** A team branch: `<agent>/HAL-<n>-<words>`, as the PR watcher reads it. */
const teamBranch = /^[a-z]+\/HAL-\d+(-|$)/i;

/** The account every agent opens pull requests with. */
const teamAuthor = "halonic-dev";

/**
 * Whether the team wrote the pull request (HAL-19283): a team branch in our
 * own repository, opened by the team's account. Bots, forks, the board's
 * other branches and an unknown author aren't routine (the live Merger's
 * origin check since 26 Nov 09:17 UTC, HAL-19779).
 */
export function writtenByTeam(origin: PullOrigin): boolean {
  return !origin.crossRepository && origin.author === teamAuthor && teamBranch.test(origin.branch);
}

/** Branches that release, and the label that marks trust and sandbox work. */
const releaseBranch = /^(changeset-release|release)\//;
const securityLabel = "area: trust and sandbox";

/**
 * Whether a pull request is a security or release one by what GitHub shows
 * (HAL-19283): a release branch or the trust and sandbox label. Security by
 * its paths is the path list's job (`isSecurityPath`).
 */
export function sensitiveOrigin(origin: PullOrigin): boolean {
  return releaseBranch.test(origin.branch) || origin.labels.includes(securityLabel);
}

/** A package's main entry point or its feature interface: any `src/index.ts` or `src/api.ts`. */
const entryPointName = /(^|\/)src\/(index|api)\.[cm]?tsx?$/;

/**
 * The other entry points packages export, outside the routine exclusions
 * and the code reviewer's paths. `routine-review.test.ts` reads every
 * `package.json` and fails when an `exports` entry is missing here; a pull
 * request that changes a package's `exports` is never routine either.
 */
export const exportedEntryPoints: readonly string[] = [
  "apps/agent-host/src/google-host.ts",
  "apps/agent-host/src/remote/remote-parts.ts",
  "packages/adapters/cloudflare-durable/src/test/test-objects.ts",
  "packages/adapters/coordination-node/src/node/index.ts",
  "packages/adapters/doctor-node/src/doctor-workspace.ts",
  "packages/adapters/git/src/testing.ts",
  "packages/adapters/harness-bridge/src/web.ts",
  "packages/adapters/harness-claude-code/src/environment.ts",
  "packages/adapters/harness-claude-code/src/web.ts",
  "packages/adapters/harness-codex/src/environment.ts",
  "packages/adapters/harness-codex/src/web.ts",
  "packages/adapters/harness-kit/src/web.ts",
  "packages/adapters/harness-opencode/src/environment.ts",
  "packages/adapters/integration-kit/src/integration/index.ts",
  "packages/adapters/mcp/src/protocol/index.ts",
  "packages/adapters/mcp/src/server/index.ts",
  "packages/adapters/remote-gateway/src/testing.ts",
  "packages/adapters/scheduler-node/src/node/index.ts",
  "packages/studio/features/assistant/src/chat/build-chat-words.ts",
  "packages/studio/features/connections/src/connections-words.ts",
  "packages/studio/features/messenger/src/messenger-words.ts",
  "packages/studio/features/remote/src/phone/client.ts",
  "packages/studio/features/remote/src/phone/index.ts",
  "packages/studio/kit/src/app-logo/app-glyphs.ts",
  "packages/studio/kit/src/settle/settle.tsx",
  "packages/studio/kit/src/theme-font.css",
  "packages/studio/kit/src/theme.css",
  "packages/studio/services/src/tauri-channel.ts",
  "packages/studio/services/src/tauri-ipc.ts",
  "packages/studio/shell/src/studio.css",
  "packages/studio/shell/src/welcome/welcome-start-words.ts",
  "packages/targets/paperclip/runtime/src/actions.ts",
  "packages/testing/contracts/src/node/index.ts",
];

/** Whether a path is a package's public interface: an entry point it exports. */
export function isPublicInterface(path: string): boolean {
  return entryPointName.test(path) || exportedEntryPoints.includes(path);
}

/** The first public interface among the paths, or undefined. */
export function publicInterfaceIn(paths: readonly string[]): string | undefined {
  return paths.find(isPublicInterface);
}
