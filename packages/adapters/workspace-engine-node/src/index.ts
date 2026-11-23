// The engine of one workspace on this computer, shared by the CLI and the
// agent host's engine role (HAL-14217): its lock, run store, scheduler,
// program copies and run connectors, and its read-only trust: nothing
// exported here grants trust or writes a trust record (HAL-17049). The
// harness host comes in from the caller, because it lives in the host
// layer, which an adapter can't use.

export { EngineLockHeldError } from "./engine-lock-held.ts";
export { type EnginePlace, engineStateFolders } from "./engine-state-folders.ts";
export {
  type EngineErrorSource,
  type EngineHarnessHost,
  type EngineVersions,
  type LocalEngine,
  type OpenEngineHarnessHost,
  type OpenLocalEngineInput,
  openLocalEngine,
} from "./local-engine.ts";
export type { LocalRunConnectorsInput, TrustedVersion } from "./local-run-connectors.ts";
export { webCryptoDigest } from "./web-crypto-digest.ts";
export { realWorkingFolders } from "./working-folders.ts";
export {
  type TrustGateSentences,
  type WorkspaceTrustDecision,
  type WorkspaceTrustGate,
  workspaceTrustGate,
} from "./workspace-trust-gate.ts";
export {
  needsNoTrust,
  type RefusedFile,
  readWorkspaceTrust,
  refusedFileKey,
  refusedFilesOf,
  type TrustedFolder,
  type TrustReadMachine,
  type WorkspaceAtVersion,
  type WorkspaceTrust,
  type WorkspaceTrustAnswer,
  type WorkspaceTrustState,
  workspaceNameOf,
  workspaceTrustState,
} from "./workspace-trust-state.ts";
