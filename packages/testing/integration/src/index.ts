// The public API of @halonicjs/testing-integration. Internal code imports by relative path.

export { canaryFor, canaryMark, canarySecrets } from "./canaries.ts";
export {
  ConformanceFailure,
  checkAbort,
  checkCase,
  checkConnectIsQuiet,
  checkDeclaration,
  checkPolicy,
  checkProviderErrors,
  checkSources,
} from "./checks.ts";
export { describeIntegrationConformance } from "./describe.ts";
export {
  canonicalBody,
  NoRecordingError,
  type Recording,
  type ReplayedRequest,
  replayTransport,
} from "./recording.ts";
export {
  type CaseRun,
  type ConformanceSubject,
  type DeclaredTool,
  runCase,
  type ToolCase,
  tripNetworkGlobals,
} from "./run.ts";
export { type SourceFinding, scanIntegrationSource } from "./source-scan.ts";
