// The public API of @halonicjs/adapter-harness-claude-code. Everything else in src/ is internal.

export type { SettingsFolderWriter } from "@halonicjs/adapter-harness-kit";
export {
  claudeProgram,
  detectClaudeCode,
  oldestSupportedVersion,
  supportedVersions,
} from "./detect.ts";
export { type ClaudeCodeFolders, claudeCodeEnvironment } from "./environment.ts";
export { type ClaudeCodeHarnessOptions, claudeCodeHarness } from "./harness.ts";
export { findSignInProblem, SignInError, type SignInProblem } from "./sign-in.ts";
