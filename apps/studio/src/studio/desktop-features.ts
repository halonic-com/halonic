import { googleSetupFeature } from "@halonicjs/studio-feature-google-setup";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import { InboxRequestsService, InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { libraryFeature } from "@halonicjs/studio-feature-library";
import {
  CollectionHostService,
  ConnectorStatusHostService,
  KnowledgeHostService,
  LibraryItemsHostService,
  LibraryTabMemoryService,
  ListedToolsHostService,
  NewCollectionHostService,
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
import { settingsFeature } from "@halonicjs/studio-feature-settings";
import {
  AssistantWorkspaceService,
  DisplaySettingsService,
  HostSettingsService,
} from "@halonicjs/studio-feature-settings/api";
import { sourceControlFeature } from "@halonicjs/studio-feature-source-control";
import { ChangesSourceService } from "@halonicjs/studio-feature-source-control/api";
import { workflowsFeature } from "@halonicjs/studio-feature-workflows";
import { WorkflowsHostService } from "@halonicjs/studio-feature-workflows/api";
import { workspaceFeature } from "@halonicjs/studio-feature-workspace";
import {
  TrustedSourcesService,
  WorkspacePageService,
} from "@halonicjs/studio-feature-workspace/api";
import type { ShellOptions } from "@halonicjs/studio-shell";

/**
 * The features of the desktop app, and the services the app gives them for each open folder.
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
    CollectionHostService,
    ConnectorStatusHostService,
    KnowledgeHostService,
    LibraryItemsHostService,
    LibraryTabMemoryService,
    NewCollectionHostService,
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
