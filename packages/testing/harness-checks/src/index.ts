// The public API of @halonicjs/testing-harness-checks. Everything else in src/ is internal.
// The checks themselves run from the command line (src/cli/); see the README.
export {
  type BridgeSandbox,
  type BridgeSandboxOptions,
  type CheckedRun,
  type CheckFolders,
  openBridgeSandbox,
} from "./bridge-sandbox.ts";
export { type ClaudeCodeFindings, checkClaudeCode } from "./claude-code-check.ts";
export { deniedHost, deniedHostsRunner } from "./denied-hosts.ts";
export { type HeaderTap, openHeaderTap, type TappedRequest } from "./header-tap.ts";
export type {
  PromptOutcome,
  PromptResult,
  RefreshOutcome,
  SignedIn,
} from "./prompt-outcome.ts";
export {
  claudeCodeReport,
  harnessReport,
  pathRows,
  promptVerdict,
  type ReportRow,
  type Verdict,
} from "./report.ts";
export { type ClaudeSignInStorage, claudeSignInStorage, type Keychain } from "./sign-in-storage.ts";
