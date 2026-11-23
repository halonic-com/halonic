// The engine of one workspace on this computer, shared by the CLI and the
// agent host's engine role (HAL-14217): its lock, run store, scheduler,
// program copies and run connectors. The harness host comes in from the
// caller, because it lives in the host layer, which an adapter can't use.

export {
  type EngineErrorSource,
  type EngineHarnessHost,
  type EnginePlace,
  type EngineVersions,
  type LocalEngine,
  type OpenEngineHarnessHost,
  type OpenLocalEngineInput,
  openLocalEngine,
} from "./local-engine.ts";
export type { LocalRunConnectorsInput, TrustedVersion } from "./local-run-connectors.ts";
export { realWorkingFolders } from "./working-folders.ts";
