// The public API of @halonicjs/adapter-connector-stdio-sandbox. Internal code imports by relative path.

// The error lives in `core/app`, so `PluginConnector` knows it as `settings-not-set`.
export { LocalToolSettingsNotSetError } from "@halonicjs/app";
export type { DeclaredTool } from "./declared-tools.ts";
export { SandboxNotFencedError, SandboxSessionEndedError } from "./errors.ts";
export {
  type LocalToolLaunch,
  type LocalToolPlace,
  localToolLaunch,
  type PinnedRunner,
  type StdioConfig,
} from "./local-tool-launch.ts";
export { readSecretEnv } from "./plan-launch.ts";
export {
  type CheckedPluginFile,
  copyCheckedPlugin,
  type PluginCopyDisk,
  PluginFileChangedError,
  pluginCopyOnThisMachine,
} from "./plugin-copy.ts";
export {
  type PluginLocalToolSetting,
  pluginLocalToolPlace,
} from "./plugin-local-tool-place.ts";
export {
  PluginLocalToolSessions,
  type PluginLocalToolSessionsOptions,
} from "./plugin-local-tool-sessions.ts";
export { type PluginLocalToolsHost, pluginLocalToolsSource } from "./plugin-local-tools-source.ts";
export {
  type ConnectorBlock,
  type LocalToolSetup,
  SandboxStdioConnectorFactory,
  type SandboxStdioOptions,
  type UndeclaredTool,
  type WorkspaceConnectorSetup,
} from "./sandbox-connector.ts";
export { sandboxProgram } from "./sandbox-program.ts";
export {
  SessionWorkspaceFactory,
  type SessionWorkspaceOptions,
} from "./session-workspace-factory.ts";
export {
  refuseAgentFolderStart,
  type WorkspaceConnectorSetting,
  workspaceConnectorPlace,
  workspaceStartFolder,
} from "./workspace-connector-place.ts";
export { WorkspaceStdioConnectorFactory } from "./workspace-stdio-factory.ts";
