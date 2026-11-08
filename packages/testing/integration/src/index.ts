// The public API of @halonicjs/testing-integration. Internal code imports by relative path.

export { canaryFor, canaryMark, canarySecrets } from "./canaries.ts";
export {
  checkAbort,
  checkCase,
  checkConnectIsQuiet,
  checkDeclaration,
  checkHostWait,
  checkPolicy,
  checkProviderErrors,
  checkSources,
} from "./checks.ts";
export { describeIntegrationConformance } from "./describe.ts";
export { ConformanceFailure } from "./failure.ts";
export { type FakeWait, fakeWait } from "./fake-wait.ts";
export {
  NoRecordingError,
  type RecordedBody,
  type RecordedExchange,
  type RecordingFile,
  type ReplayedRequest,
  recordingFormat,
  replayTransport,
} from "./recording.ts";
export {
  type CaseRun,
  type ConformanceSubject,
  runCase,
  scenarioOf,
  type ToolCase,
  tripNetworkGlobals,
} from "./run.ts";
export { type SourceFinding, scanIntegrationSource } from "./source-scan.ts";
