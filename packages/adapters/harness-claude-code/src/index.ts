// The public API of @halonicjs/adapter-harness-claude-code. Everything else in src/ is internal.
// `start` comes with the stream-json reader (build plan C2 and C3); until then
// the parts are exported on their own.
export {
  claudeProgram,
  detectClaudeCode,
  oldestSupportedVersion,
  supportedVersions,
} from "./detect.ts";
export { type ClaudeCodeFolders, claudeCodeEnvironment } from "./environment.ts";
export { findSignInProblem, SignInError, type SignInProblem } from "./sign-in.ts";
