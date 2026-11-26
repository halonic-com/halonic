/**
 * What the routine reviewer (Nora, HAL-19246) never approves alone, on top
 * of the code reviewer's paths: the paths the board kept with Liam and Julian
 * on HAL-18424, and the public interfaces (HAL-19283). `routineRefusal` in
 * `reviewer-paths.ts` applies them. The live Merger loads this file with
 * `reviewer-paths.ts`, so it imports nothing at run time.
 */

/**
 * Folders the routine reviewer doesn't approve alone: the core building
 * blocks, the host, the spec helper the guard runs on (the board, HAL-18424),
 * and the shared lint, type and test config every package runs on (HAL-19283).
 */
export const routineExcludedFolders: readonly string[] = [
  "packages/core/",
  "packages/host/",
  "packages/testing/spec/",
  "tooling/config/",
];

/**
 * Exact files the routine reviewer doesn't approve alone (HAL-19283): the
 * rules every agent reads, git's file handling, and the legal text that
 * carries the contributor statement.
 */
export const routineExcludedFiles: readonly string[] = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
];

/** File names excluded in any folder: `.gitattributes`, and licence and notice files. */
const routineExcludedNames =
  /(^|\/)(\.gitattributes|(LICENSE|LICENCE|NOTICE|COPYING)(\.[a-z]+)?)$/i;

/** Whether a changed path keeps the pull request from being a routine review. */
export function isRoutineExcluded(path: string): boolean {
  return (
    routineExcludedFiles.includes(path) ||
    routineExcludedFolders.some((folder) => path.startsWith(folder)) ||
    routineExcludedNames.test(path)
  );
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
