import { agentsFeature } from "@halonicjs/studio-feature-agents";
import { AgentReviewService, AgentsHostService } from "@halonicjs/studio-feature-agents/api";
import { checkComputerFeature } from "@halonicjs/studio-feature-check-computer";
import { connectionsFeature } from "@halonicjs/studio-feature-connections";
import { feedbackFeature } from "@halonicjs/studio-feature-feedback";
import { filesFeature } from "@halonicjs/studio-feature-files";
import { FilesHostService } from "@halonicjs/studio-feature-files/api";
import { firstRunFeature } from "@halonicjs/studio-feature-first-run";
import {
  FirstRunDeviceService,
  SampleWorkspaceService,
} from "@halonicjs/studio-feature-first-run/api";
import { googleSetupFeature } from "@halonicjs/studio-feature-google-setup";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import { InboxRequestsService, InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { libraryFeature } from "@halonicjs/studio-feature-library";
import {
  CollectionHostService,
  ConnectorSecretsService,
  ConnectorStatusHostService,
  KnowledgeHostService,
  LibraryItemsHostService,
  LibraryTabMemoryService,
  ListedToolsHostService,
  NewCollectionHostService,
  NewConnectorHostService,
  NewSkillHostService,
  SkillHostService,
} from "@halonicjs/studio-feature-library/api";
import { messengerFeature } from "@halonicjs/studio-feature-messenger";
import { modelsFeature } from "@halonicjs/studio-feature-models";
import {
  ModelKeysService,
  ModelsFilesService,
  NoLimitMemoryService,
} from "@halonicjs/studio-feature-models/api";
import { overviewFeature } from "@halonicjs/studio-feature-overview";
import { pluginsFeature } from "@halonicjs/studio-feature-plugins";
import { PluginsHostService } from "@halonicjs/studio-feature-plugins/api";
import { remoteFeature } from "@halonicjs/studio-feature-remote";
import { routinesFeature } from "@halonicjs/studio-feature-routines";
import { RoutinesHostService } from "@halonicjs/studio-feature-routines/api";
import { runsFeature } from "@halonicjs/studio-feature-runs";
import { RunsSourceService, SampleHintService } from "@halonicjs/studio-feature-runs/api";
import { searchFeature } from "@halonicjs/studio-feature-search";
import { settingsFeature } from "@halonicjs/studio-feature-settings";
import {
  AssistantWorkspaceService,
  DisplaySettingsService,
  HostSettingsService,
} from "@halonicjs/studio-feature-settings/api";
import { sourceControlFeature } from "@halonicjs/studio-feature-source-control";
import {
  ChangesSourceService,
  ShareChoiceService,
} from "@halonicjs/studio-feature-source-control/api";
import { teamFeature } from "@halonicjs/studio-feature-team";
import { workflowsFeature } from "@halonicjs/studio-feature-workflows";
import {
  WorkflowReviewService,
  WorkflowsHostService,
} from "@halonicjs/studio-feature-workflows/api";
import { workspaceFeature } from "@halonicjs/studio-feature-workspace";
import {
  TrustedSourcesService,
  WorkspacePageService,
} from "@halonicjs/studio-feature-workspace/api";
import { FilesWithErrorsService, type ShellOptions } from "@halonicjs/studio-shell";

/**
 * The features of the desktop app, and the services the app gives them for each open folder.
 */
export const desktopFeatures: Pick<ShellOptions, "features" | "hostServices"> = {
  features: [
    checkComputerFeature,
    connectionsFeature,
    feedbackFeature,
    filesFeature,
    firstRunFeature,
    googleSetupFeature,
    inboxFeature,
    libraryFeature,
    messengerFeature,
    modelsFeature,
    overviewFeature,
    pluginsFeature,
    remoteFeature,
    runsFeature,
    searchFeature,
    settingsFeature,
    sourceControlFeature,
    agentsFeature,
    workflowsFeature,
    routinesFeature,
    workspaceFeature,
    teamFeature,
  ],
  hostServices: [
    FilesHostService,
    FilesWithErrorsService,
    CollectionHostService,
    ConnectorStatusHostService,
    KnowledgeHostService,
    LibraryItemsHostService,
    LibraryTabMemoryService,
    NewCollectionHostService,
    NewConnectorHostService,
    NewSkillHostService,
    SkillHostService,
    GoogleSetupAccountsService,
    ListedToolsHostService,
    ConnectorSecretsService,
    InboxRunsService,
    InboxRequestsService,
    RunsSourceService,
    ChangesSourceService,
    ShareChoiceService,
    AgentsHostService,
    AgentReviewService,
    WorkflowsHostService,
    WorkflowReviewService,
    RoutinesHostService,
    ModelsFilesService,
    ModelKeysService,
    NoLimitMemoryService,
    PluginsHostService,
    DisplaySettingsService,
    HostSettingsService,
    AssistantWorkspaceService,
    WorkspacePageService,
    SampleWorkspaceService,
    FirstRunDeviceService,
    SampleHintService,
    TrustedSourcesService,
  ],
};
