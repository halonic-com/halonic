// The public API of @halonicjs/adapter-harness-claude-code. Everything else in src/ is internal.
export {
  claudeProgram,
  detectClaudeCode,
  oldestSupportedVersion,
  supportedVersions,
} from "./detect.ts";
export { type ClaudeCodeFolders, claudeCodeEnvironment } from "./environment.ts";
export { type ClaudeCodeHarnessOptions, claudeCodeHarness } from "./harness.ts";
export type { SettingsFolderWriter } from "./settings.ts";
export { findSignInProblem, SignInError, type SignInProblem } from "./sign-in.ts";
