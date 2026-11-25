import { AgentHostChat } from "@halonicjs/adapter-agent-host-client";
import {
  type EngineLockLostKind,
  TauriChatSessions,
  TauriDefinitionStore,
  type TauriFileShell,
  TauriInstructionTrustStore,
  TauriRecordStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import {
  InstructionTrustService,
  reviewServiceKey,
  type ServiceRegistry,
  type WorkspaceScope,
  workspaceFilesKey,
} from "@halonicjs/app";
import { systemClock } from "@halonicjs/std";
import { AgentReviewService, AgentsHostService } from "@halonicjs/studio-feature-agents/api";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";
import {
  HeldAgentsService,
  InboxRequestsService,
  monthBudgetUse,
} from "@halonicjs/studio-feature-inbox/api";
import {
  CollectionHostService,
  KnowledgeHostService,
  LibraryItemsHostService,
  LibraryTabMemoryService,
  NewCollectionHostService,
  NewConnectorHostService,
  NewSkillHostService,
  RefusalsFeed,
  SkillHostService,
} from "@halonicjs/studio-feature-library/api";
import {
  ModelKeysService,
  ModelsFilesService,
  NoLimitMemoryService,
  ProviderCheckService,
} from "@halonicjs/studio-feature-models/api";
import { RoutinesHostService } from "@halonicjs/studio-feature-routines/api";
import {
  InstructionTrustHostService,
  RunNoticeClicksService,
  RunsSourceService,
} from "@halonicjs/studio-feature-runs/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import { VersionDialogService } from "@halonicjs/studio-feature-source-control/api";
import {
  WorkflowReviewService,
  WorkflowsHostService,
} from "@halonicjs/studio-feature-workflows/api";
import {
  ShellHttpClient,
  shellKeychain,
  shellKeyOrigins,
  shellRunNoticeClicks,
  type TauriIpc,
  tauriAgentHostTransport,
  tauriChannelIpc,
} from "@halonicjs/studio-services";
import {
  EngineNotAnswering,
  type KeyboardPlatform,
  type ShellEngine,
} from "@halonicjs/studio-shell";
import { loadWorkspace } from "@halonicjs/workspace";
import { agentHostHarnessParts } from "../agents/agent-host-harness-parts.ts";
import { agentHostPlacement } from "../agents/agent-host-placement.ts";
import { WorkspaceAgentReview } from "../agents/workspace-agent-review.ts";
import { WorkspaceAgents } from "../agents/workspace-agents.ts";
import { provideAssistantHost } from "../assistant/provide-assistant-host.ts";
import { provideChangesServices } from "../changes/provide-changes-services.ts";
import { type WatchItemTryItChanges, watchTryItChanges } from "../changes/try-it-changes.ts";
import { provideCheckComputer } from "../check-computer/provide-check-computer.ts";
import { answerChatOn, chatExecutorOf } from "../engine/answer-chat-on.ts";
import { EngineService, engineServiceKey } from "../engine/engine-service.ts";
import type { RemoteEngine } from "../engine/remote-engine.ts";
import { provideFilesServices } from "../files/provide-files-services.ts";
import { provideGoogleSetup } from "../google/provide-google-setup.ts";
import { provideAgentConnections } from "../inbox/provide-agent-connections.ts";
import { provideAgentMessaging } from "../inbox/provide-agent-messaging.ts";
import { WorkspaceHeldAgents } from "../inbox/workspace-held-agents.ts";
import { WorkspaceRequests } from "../inbox/workspace-requests.ts";
import { provideLibraryServices } from "../library/provide-library-services.ts";
import { WorkspaceCollections } from "../library/workspace-collections.ts";
import { WorkspaceKnowledge } from "../library/workspace-knowledge.ts";
import { WorkspaceLibraryItems } from "../library/workspace-library-items.ts";
import { WorkspaceLibraryTab } from "../library/workspace-library-tab.ts";
import { WorkspaceNewCollection } from "../library/workspace-new-collection.ts";
import { WorkspaceNewConnector } from "../library/workspace-new-connector.ts";
import { WorkspaceNewSkill } from "../library/workspace-new-skill.ts";
import { WorkspaceSkills } from "../library/workspace-skills.ts";
import { provideModelChoice } from "../models/provide-model-choice.ts";
import { WorkspaceModelKeys } from "../models/workspace-model-keys.ts";
import { WorkspaceModelsFiles } from "../models/workspace-models-files.ts";
import { WorkspaceNoLimit } from "../models/workspace-no-limit.ts";
import { WorkspaceProviderCheck } from "../models/workspace-provider-check.ts";
import { providePlugins } from "../plugins/provide-plugins.ts";
import { WorkspaceRoutines } from "../routines/workspace-routines.ts";
import { provideAllRuns } from "../runs/all-runs-sources.ts";
import { WorkspaceWorkflowReview } from "../workflows/workspace-workflow-review.ts";
import { WorkspaceWorkflows } from "../workflows/workspace-workflows.ts";
import { folderEngine } from "./folder-engine.ts";
import { focusOf, storageOf } from "./page-window.ts";
import { provideEngineAutoOpen } from "./provide-engine-auto-open.ts";
import { provideRunStart } from "./provide-run-start.ts";
import { provideWorkspaceRuns } from "./provide-workspace-runs.ts";
import { WorkspaceInstructionTrust } from "./workspace-instruction-trust.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** What the services of one open folder read: the shell, the page's window and the folder. */
export interface FolderServiceParts {
  readonly ipc: TauriIpc;
  readonly files: TauriFileShell;
  readonly window: object;
  readonly trust: WorkspaceTrust;
  /** Opens the window's trust check for a start it refused, and says how the person answered. */
  readonly askTrust: () => Promise<"trusted" | "declined">;
  readonly location: string;
  /** The computer's operating system, which names its file manager in the Files host's refusals. */
  readonly platform: KeyboardPlatform;
  /** The workspace's name, as the window shows it. */
  readonly name: string;
  /** The open workspace, whose files and events the Models feature reads. */
  readonly scope: WorkspaceScope;
  /**
   * Saves what is waiting through the workspace's save state, so the toolbar says "Saving…" and a
   * failure has its toast; rejects when the save fails. Absent: Run starts without waiting.
   */
  readonly settle?: () => Promise<void>;
  /** Hears when the workspace's engine lock was lost, and which kind of loss (`studio.engine-lock-lost-toast`). */
  readonly onEngineLockLost?: (kind: EngineLockLostKind) => void;
  /**
   * The engine that runs the workspace in the background, when the shell reported one as the
   * folder opened. Then the page opens no engine of its own: no engine lock, no routine timers.
   */
  readonly remoteEngine?: RemoteEngine | undefined;
  /** The window's engine connection: an Assistant answer ends when the engine stops answering. */
  readonly engineConnection?: Pick<ShellEngine, "on" | "connection"> | undefined;
}

/** Gives the folder in `location` the services its features read through the shell. */
export function provideFolderServices(
  services: ServiceRegistry,
  {
    ipc,
    files,
    window,
    trust,
    askTrust,
    location,
    platform,
    name,
    scope,
    settle,
    onEngineLockLost,
    remoteEngine,
    engineConnection,
  }: FolderServiceParts,
): void {
  services.provide(
    ModelsFilesService,
    new WorkspaceModelsFiles({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
    }),
  );
  provideFilesServices(services, { files, location, scope, platform });
  const keys = services.provide(
    ModelKeysService,
    new WorkspaceModelKeys(shellKeychain(ipc), shellKeyOrigins(ipc)),
  );
  provideModelChoice(services, { ipc, trust, keys, settle });
  services.provide(NoLimitMemoryService, new WorkspaceNoLimit(storageOf(window), location));
  services.provide(
    ProviderCheckService,
    new WorkspaceProviderCheck(new ShellHttpClient(ipc), trust),
  );
  const transport = tauriAgentHostTransport(window);
  // Try it and Test read the assistant's changes you haven't accepted yet, and say so (flow-assistant 4.4).
  const tryItChanges: WatchItemTryItChanges = (itemPath, listener) =>
    watchTryItChanges(
      {
        review: services.get(reviewServiceKey),
        workspaceName: name,
        reportError: (error) => console.error("Reading the changes to review for Try it", error),
      },
      itemPath,
      listener,
    );
  provideWorkspaceRuns(services, { ipc, files, window, remoteEngine, transport, trust }, location);
  // One service for both ends: the run page saves a person's trust, and the engine checks it.
  const instructionTrust = new InstructionTrustService({
    store: new TauriInstructionTrustStore(ipc),
    clock: systemClock,
  });
  services.provide(
    InstructionTrustHostService,
    new WorkspaceInstructionTrust(instructionTrust, location),
  );
  const { changes, liveness, onLivenessChange } = provideChangesServices(services, {
    ipc,
    files,
    window,
    location,
    scope,
  });
  const refusals = new RefusalsFeed();
  const engine =
    remoteEngine ??
    services.provide(
      engineServiceKey,
      folderEngine(services, {
        ipc,
        files,
        trust,
        location,
        name,
        instructionTrust,
        transport,
        refusals,
        onEngineLockLost,
      }),
    );
  provideEngineAutoOpen(services, { ipc, files, trust, location, scope, remoteEngine, window });
  provideAgentMessaging(services, transport, location, window);
  provideAllRuns(services, name);
  provideAgentConnections(services, transport, location);
  // Settings › New agents run and the Harness page share the agent host's choices.
  // One store for the workspace's chats: the Assistant's Build chats and the agents' Try it chats.
  const chatSessions = new TauriChatSessions(ipc);
  const placed =
    transport === undefined ? undefined : agentHostPlacement(transport, files, location, changes);
  const agents = services.provide(
    AgentsHostService,
    new WorkspaceAgents({
      files: services.get(workspaceFilesKey),
      onChange: onLivenessChange,
      liveness: async (path) => (await liveness.liveState(path)).state,
      answerChat: answerChatOn(chatExecutorOf(engine), refusals),
      ...(transport === undefined || placed === undefined
        ? {}
        : {
            ...agentHostHarnessParts(transport, location),
            newAgents: {
              settings: services.get(HostSettingsService),
              placement: placed.placement,
              location,
              reportError: (error) => console.error("Placing a new agent", error),
            },
            placement: placed.choices,
          }),
      // Looked up when Review and make live is pressed, as for the routines below.
      versionDialog: (paths, options) =>
        services.get(VersionDialogService).open(paths, { makesLive: options?.name }),
      // Send checks first, so the trust check opens; the engine still refuses with `denied`.
      trust: { mayStart: () => trust.mayStartNow(), askTrust, workspaceName: name },
      tryItChanges,
      savedChats: { sessions: chatSessions, location },
    }),
  );
  provideAssistantHost(services, {
    files,
    location,
    trust,
    answerChat: answerChatOn(chatExecutorOf(engine), refusals),
    authoring: {
      secrets: shellKeychain(ipc),
      keyOrigins: shellKeyOrigins(ipc),
      http: new ShellHttpClient(ipc),
      clock: systemClock,
    },
    engine: engineConnection,
    name,
    askTrust,
    chatSessions,
    docsHttp: new ShellHttpClient(ipc, { publicOnly: true }),
  });
  // The assistant's changes to an agent, for its page's item bar and marks (AI changes 1.2).
  services.provide(
    AgentReviewService,
    new WorkspaceAgentReview({
      review: services.get(reviewServiceKey),
      pathOf: (ref) => agents.filePath(ref),
    }),
  );
  // An agent on hold gets its own Inbox row; without the agent host nothing can be on hold.
  if (placed !== undefined) {
    services.provide(
      HeldAgentsService,
      new WorkspaceHeldAgents(agents, services.get(RunsSourceService)),
    );
  }
  // The status bar's Review trusts the workspace too; a refusal on the page then goes (C552, C596).
  const onTrusted = (listener: () => void) =>
    trust.subscribe(() => {
      if (trust.mayStartNow()) listener();
    });
  const workflows = new WorkspaceWorkflows({
    files: services.get(workspaceFilesKey),
    onChange: (listener) => scope.events.on("files.changed", listener),
    runs: services.get(RunsSourceService),
    folder: location,
    ...(settle === undefined ? {} : { settle }),
    engine,
    askTrust,
    onTrusted,
    tryItChanges,
  });
  services.provide(WorkflowsHostService, workflows);
  // The assistant's changes to a workflow, for its page's item bar and marks (AI changes 1.2).
  services.provide(
    WorkflowReviewService,
    new WorkspaceWorkflowReview({
      review: services.get(reviewServiceKey),
      pathOf: (ref) => workflows.filePath(ref),
    }),
  );
  services.provide(
    RoutinesHostService,
    new WorkspaceRoutines({
      files: services.get(workspaceFilesKey),
      onChange: onLivenessChange,
      liveness: () => liveness.routineVersionsAt(),
      runs: services.get(RunsSourceService),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      now: () => new Date(),
      // Run now refuses with the routine's own words; the engine checks again before it starts.
      trusted: async () => trust.mayStartNow(),
      engine: { start: (start, trigger) => engine.startRoutine(start, trigger) },
      skips: (key) => engine.routineSkips(key),
      onSkips: (listener) => engine.onRoutineSkips(listener),
      // Looked up when Make live is pressed, as the source control feature's services come later.
      versionDialog: (paths, options) =>
        services.get(VersionDialogService).open(paths, { makesLive: options?.name }),
      askTrust,
    }),
  );
  provideRunStart(services, { workflows, engine, askTrust, trust });
  // A click on a run notification opens the run (`runs.run-notification-open`).
  const channelIpc = tauriChannelIpc(window);
  if (channelIpc !== undefined) {
    const onError = (error: unknown) => console.error("Opening a run notification", error);
    services.provide(RunNoticeClicksService, shellRunNoticeClicks(channelIpc, onError));
  }
  services.provide(
    InboxRequestsService,
    new WorkspaceRequests({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
      monthBudget: async () => {
        const runs = services.get(RunsSourceService);
        const summaries = (await runs.list()).map((run) => run.summary);
        const limit = runs.monthlyBudget();
        return monthBudgetUse(
          summaries,
          limit === undefined ? undefined : { limit, currency: runs.currency() },
          new Date(),
        );
      },
      engine,
    }),
  );
  const libraryItems = new WorkspaceLibraryItems({
    files: services.get(workspaceFilesKey),
    onChange: (listener) => scope.events.on("files.changed", listener),
  });
  services.provide(LibraryItemsHostService, libraryItems);
  services.provide(
    SkillHostService,
    new WorkspaceSkills({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
    }),
  );
  services.provide(
    CollectionHostService,
    new WorkspaceCollections({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
      records: new TauriRecordStore(ipc, location),
      clock: systemClock,
    }),
  );
  services.provide(
    KnowledgeHostService,
    new WorkspaceKnowledge({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
      // The window can't reach a model: the agent host calls one on this computer for it.
      chat:
        transport === undefined
          ? () => Promise.reject(new EngineNotAnswering())
          : (provider, request) => new AgentHostChat(transport, location).chat(provider, request),
      // The agent host reads the saved provider files, so their trust is what counts.
      mayCallModel: async () =>
        trust.mayStart(await loadWorkspace(new TauriDefinitionStore(files, location))),
    }),
  );
  services.provide(
    NewCollectionHostService,
    new WorkspaceNewCollection(
      {
        files: services.get(workspaceFilesKey),
        onChange: (listener) => scope.events.on("files.changed", listener),
      },
      (place, name) => libraryItems.remember("collection", place, name),
    ),
  );
  services.provide(
    NewConnectorHostService,
    new WorkspaceNewConnector(
      {
        files: services.get(workspaceFilesKey),
        onChange: (listener) => scope.events.on("files.changed", listener),
      },
      (place, name) => libraryItems.remember("connector", place, name),
    ),
  );
  services.provide(
    NewSkillHostService,
    new WorkspaceNewSkill(
      {
        files: services.get(workspaceFilesKey),
        onChange: (listener) => scope.events.on("files.changed", listener),
      },
      (place, name) => libraryItems.remember("skill", place, name),
    ),
  );
  services.provide(LibraryTabMemoryService, new WorkspaceLibraryTab(storageOf(window), location));
  provideGoogleSetup(services, {
    ipc,
    files,
    transport,
    location,
    onFocus: (listener) => focusOf(window, listener),
  });
  providePlugins(services, {
    ipc,
    window,
    transport,
    platform,
    onFocus: (listener) => focusOf(window, listener),
    onReloadFailed: (error) => console.error("Couldn't read the plugins folder", error),
  });
  provideLibraryServices(services, {
    ipc,
    files,
    transport,
    trust,
    askTrust,
    refusals,
    google: services.get(GoogleSetupAccountsService),
    location,
    onFocus: (listener) => focusOf(window, listener),
  });
  // Last: Check this computer reads the runs, the keys and the Google setups provided above.
  provideCheckComputer(services, { files, location, name, platform, transport, remoteEngine });
}
