import {
  TauriDefinitionStore,
  type TauriFileShell,
  TauriPickedFolders,
  TauriTrustStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import {
  openWorkspace,
  ServiceRegistry,
  type WorkspaceScope,
  workspaceFilesKey,
} from "@halonicjs/app";
import { googleSetupFeature } from "@halonicjs/studio-feature-google-setup";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import { InboxRequestsService, InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { libraryFeature } from "@halonicjs/studio-feature-library";
import {
  ConnectorStatusHostService,
  KnowledgeHostService,
  LibraryItemsHostService,
  LibraryTabMemoryService,
  ListedToolsHostService,
  NewSkillHostService,
  SkillHostService,
} from "@halonicjs/studio-feature-library/api";
import { modelsFeature } from "@halonicjs/studio-feature-models";
import {
  ModelKeysService,
  ModelsFilesService,
  NoLimitMemoryService,
} from "@halonicjs/studio-feature-models/api";
import { pluginsFeature } from "@halonicjs/studio-feature-plugins";
import { PluginsHostService } from "@halonicjs/studio-feature-plugins/api";
import { runsFeature } from "@halonicjs/studio-feature-runs";
import { RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import {
  BrowserDisplayPrefs,
  DisplaySettings,
  type DisplayStorage,
  settingsFeature,
  TauriUpdater,
  watchAppearance,
} from "@halonicjs/studio-feature-settings";
import {
  AgentSandboxService,
  AssistantWorkspaceService,
  DisplaySettingsService,
  HostSettingsService,
  RestartRunsService,
  UpdaterService,
} from "@halonicjs/studio-feature-settings/api";
import { sourceControlFeature } from "@halonicjs/studio-feature-source-control";
import { ChangesSourceService } from "@halonicjs/studio-feature-source-control/api";
import { workflowsFeature } from "@halonicjs/studio-feature-workflows";
import { WorkflowsHostService } from "@halonicjs/studio-feature-workflows/api";
import {
  folderName,
  mountWorkspaceWindow,
  type OpenedWorkspace,
  type RecentStorage,
  RecentWorkspaces,
  WorkspaceSaving,
  WorkspaceSwitcher,
  workspaceFeature,
} from "@halonicjs/studio-feature-workspace";
import {
  TrustedSourcesService,
  WorkspacePageService,
} from "@halonicjs/studio-feature-workspace/api";
import {
  onWindowCloseRequested,
  provideShellHostSettings,
  provideShellSecrets,
  type TauriCallbacks,
  type TauriIpc,
  tauriAgentHostTransport,
  tauriChannelIpc,
  tauriIpc,
} from "@halonicjs/studio-services";
import {
  createShell,
  type KeyboardPlatform,
  type Shell,
  type ShellOptions,
  type StudioHost,
  StudioWorkspace,
} from "@halonicjs/studio-shell";

/**
 * The features of the desktop app, and the services the app gives them for each open folder
 * ({@link openFolder}).
 */
export const desktopFeatures: Pick<ShellOptions, "features" | "hostServices"> = {
  features: [
    googleSetupFeature,
    inboxFeature,
    libraryFeature,
    modelsFeature,
    pluginsFeature,
    runsFeature,
    settingsFeature,
    sourceControlFeature,
    workflowsFeature,
    workspaceFeature,
  ],
  hostServices: [
    ConnectorStatusHostService,
    KnowledgeHostService,
    LibraryItemsHostService,
    LibraryTabMemoryService,
    NewSkillHostService,
    SkillHostService,
    GoogleSetupAccountsService,
    ListedToolsHostService,
    InboxRunsService,
    InboxRequestsService,
    RunsSourceService,
    ChangesSourceService,
    WorkflowsHostService,
    ModelsFilesService,
    ModelKeysService,
    NoLimitMemoryService,
    PluginsHostService,
    DisplaySettingsService,
    HostSettingsService,
    AssistantWorkspaceService,
    WorkspacePageService,
    TrustedSourcesService,
  ],
};
