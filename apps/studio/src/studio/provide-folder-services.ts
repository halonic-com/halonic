import { AgentHostChat, AgentHostPlacementStore } from "@halonicjs/adapter-agent-host-client";
import {
  TauriDefinitionStore,
  TauriEngineLock,
  type TauriFileShell,
  TauriInstructionTrustStore,
  TauriRecordStore,
  TauriRunStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import {
  AgentPlacement,
  InstructionTrustService,
  type ServiceRegistry,
  type WorkspaceScope,
  workspaceFilesKey,
} from "@halonicjs/app";
import { randomIds, systemClock } from "@halonicjs/std";
import { AgentsHostService } from "@halonicjs/studio-feature-agents/api";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";
import {
  InboxNoticesService,
  InboxRequestsService,
  InboxRunsService,
  monthBudgetUse,
  SandboxRefusalsService,
} from "@halonicjs/studio-feature-inbox/api";
import {
  CollectionHostService,
  KnowledgeHostService,
  LibraryItemsHostService,
  LibraryTabMemoryService,
  NewCollectionHostService,
  NewConnectorHostService,
  NewSkillHostService,
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
  RunStartHostService,
  RunsSourceService,
  VersionHistoryHostService,
} from "@halonicjs/studio-feature-runs/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import {
  ChangesSourceService,
  ShareChoiceService,
  VersionDialogService,
} from "@halonicjs/studio-feature-source-control/api";
import { WorkflowsHostService } from "@halonicjs/studio-feature-workflows/api";
import {
  ShellHttpClient,
  shellKeychain,
  shellKeyOrigins,
  type TauriIpc,
  tauriAgentHostTransport,
  tokenStoreKey,
} from "@halonicjs/studio-services";
import { EngineNotAnswering, type KeyboardPlatform } from "@halonicjs/studio-shell";
import { loadWorkspace } from "@halonicjs/workspace";
import { agentHostHarnessParts } from "../agents/agent-host-harness-parts.ts";
import { WorkspaceAgents } from "../agents/workspace-agents.ts";
import { folderLiveness } from "../changes/folder-liveness.ts";
import { shareChoiceMemory } from "../changes/share-choice.ts";
import { versionHistoryOf } from "../changes/version-history.ts";
import { WatchedChanges } from "../changes/watched-changes.ts";
import type { GitAnswer } from "../changes/workspace-changes.ts";
import { choicesMemory } from "../changes/workspace-merge.ts";
import { answerChatOn, EngineService, engineServiceKey } from "../engine/engine-service.ts";
import type { RemoteEngine } from "../engine/remote-engine.ts";
import { openStudioHarnessHost } from "../engine/studio-harness-host.ts";
import { provideFilesServices } from "../files/provide-files-services.ts";
import { provideGoogleSetup } from "../google/provide-google-setup.ts";
import { WorkspaceNotices } from "../inbox/workspace-notices.ts";
import { WorkspaceRequests } from "../inbox/workspace-requests.ts";
import { WorkspaceSandboxRefusals } from "../inbox/workspace-sandbox-refusals.ts";
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
import { WorkspaceRuns } from "../runs/workspace-runs.ts";
import { WorkspaceWorkflows } from "../workflows/workspace-workflows.ts";
import { openStudioRunConnectors } from "./open-run-connectors.ts";
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
  /** Hears when another process took the workspace's engine lock over (`studio.engine-lock-lost-toast`). */
  readonly onEngineLockLost?: () => void;
  /**
   * The engine that runs the workspace in the background, when the shell reported one as the
   * folder opened. Then the page opens no engine of its own: no engine lock, no routine timers.
   */
  readonly remoteEngine?: RemoteEngine | undefined;
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
  const keys = services.provide(ModelKeysService, new WorkspaceModelKeys(shellKeychain(ipc)));
  provideModelChoice(services, { ipc, trust, keys, settle });
  services.provide(NoLimitMemoryService, new WorkspaceNoLimit(storageOf(window), location));
  services.provide(ProviderCheckService, new WorkspaceProviderCheck(new ShellHttpClient(ipc)));
  provideWorkspaceRuns(services, { ipc, files, window, remoteEngine }, location);
  // One service for both ends: the run page saves a person's trust, and the engine checks it.
  const instructionTrust = new InstructionTrustService({
    store: new TauriInstructionTrustStore(ipc),
    clock: systemClock,
  });
  services.provide(
    InstructionTrustHostService,
    new WorkspaceInstructionTrust(instructionTrust, location),
  );
  const changes = new WatchedChanges({
    git: async (args) =>
      (await ipc.invoke("git", { root: location, args: [...args] })) as GitAnswer,
    files: new TauriDefinitionStore(files, location),
    // `.studio/discarded`, which the folder's own store refuses as private.
    copies: new TauriDefinitionStore(files, location, { folder: "discarded" }),
    choices: choicesMemory(storageOf(window), location),
    digest: webCryptoDigest,
    onFocus: (listener) => focusOf(window, listener),
    onFilesChanged: (listener) => scope.events.on("files.changed", listener),
  });
  services.provide(ChangesSourceService, changes);
  services.provide(VersionHistoryHostService, versionHistoryOf(changes));
  services.provide(ShareChoiceService, shareChoiceMemory(storageOf(window), location));
  const { liveness, onChange: onLivenessChange } = folderLiveness({
    changes,
    saved: new TauriDefinitionStore(files, location),
    events: scope.events,
  });
  const transport = tauriAgentHostTransport(window);
  const engine =
    remoteEngine ??
    services.provide(
      engineServiceKey,
      new EngineService({
        ipc,
        lock: new TauriEngineLock(files, location),
        location,
        name,
        definitions: new TauriDefinitionStore(files, location),
        secrets: shellKeychain(ipc),
        keyOrigins: shellKeyOrigins(ipc),
        http: new ShellHttpClient(ipc),
        clock: systemClock,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isTrusted: async (workspace) => (await trust.checkLoaded(workspace)).status === "trusted",
        mayStart: (workspace) => trust.mayStart(workspace),
        // Removing the trust here or in Settings › Trusted sources checks it again.
        onTrustChange: (listener) => trust.subscribe(listener),
        ids: randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), systemClock),
        setTimer: (callback, delayMs) => {
          const timer = setTimeout(callback, delayMs);
          return () => clearTimeout(timer);
        },
        newToken: () => crypto.randomUUID(),
        reportError: (error) => console.error("The engine", error),
        ...(onEngineLockLost === undefined ? {} : { onLockLost: onEngineLockLost }),
        ...(transport === undefined
          ? {}
          : {
              openHarnessHost: (decisions) =>
                openStudioHarnessHost({
                  transport,
                  location,
                  definitions: new TauriDefinitionStore(files, location),
                  digest: webCryptoDigest,
                  clock: systemClock,
                  instructionTrust,
                  ...decisions,
                  reportError: (error) => console.error("The harness host", error),
                }),
              openRunConnectors: () =>
                openStudioRunConnectors({
                  ipc,
                  files,
                  location,
                  transport,
                  trust,
                  tokens: services.get(tokenStoreKey),
                }),
            }),
      }),
    );
  services.provide(
    AgentsHostService,
    new WorkspaceAgents({
      files: services.get(workspaceFilesKey),
      onChange: onLivenessChange,
      liveness: async (path) => (await liveness.liveState(path)).state,
      // The background engine has no chat route yet, so its window answers "not answering".
      ...(engine instanceof EngineService ? { answerChat: answerChatOn(engine) } : {}),
      ...(transport === undefined
        ? {}
        : {
            ...agentHostHarnessParts(transport, location),
            newAgents: {
              settings: services.get(HostSettingsService),
              placement: new AgentPlacement({
                store: new AgentHostPlacementStore(transport),
                digest: webCryptoDigest,
                clock: systemClock,
              }),
              location,
              reportError: (error) => console.error("Placing a new agent", error),
            },
          }),
      // Looked up when Review and make live is pressed, as for the routines below.
      versionDialog: (paths) => services.get(VersionDialogService).open(paths),
    }),
  );
  const workflows = services.provide(
    WorkflowsHostService,
    new WorkspaceWorkflows({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
      runs: services.get(RunsSourceService),
      folder: location,
      ...(settle === undefined ? {} : { settle }),
      engine,
      askTrust,
    }),
  );
  services.provide(
    RoutinesHostService,
    new WorkspaceRoutines({
      files: services.get(workspaceFilesKey),
      onChange: onLivenessChange,
      liveness: (path) => liveness.routineVersions(path),
      runs: services.get(RunsSourceService),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      now: () => new Date(),
      // Run now refuses with the routine's own words; the engine checks again before it starts.
      trusted: async () => trust.mayStartNow(),
      engine: { start: (start, trigger) => engine.startRoutine(start, trigger) },
      // The source control feature gives the dialog once the shell instantiates its services,
      // which is after this, so it is looked up when Make live is pressed.
      versionDialog: (paths) => services.get(VersionDialogService).open(paths),
      askTrust,
    }),
  );
  // Run again on the run page starts a run the way the workflow page's Run does.
  const { startRun } = workflows;
  if (startRun !== undefined) {
    services.provide(RunStartHostService, {
      startRun: ({ hubId, workflowId }, input) =>
        startRun.call(workflows, { hubId, id: workflowId }, input),
      askTrust,
    });
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
    google: services.get(GoogleSetupAccountsService),
    location,
    onFocus: (listener) => focusOf(window, listener),
  });
}

/**
 * Gives the workspace in `location` its runs, read through the shell, as both the Runs
 * feature's and the Inbox's source.
 */
function provideWorkspaceRuns(
  services: ServiceRegistry,
  {
    ipc,
    files,
    window,
    remoteEngine,
  }: {
    ipc: TauriIpc;
    files: TauriFileShell;
    window: object;
    remoteEngine?: RemoteEngine | undefined;
  },
  location: string,
): void {
  const runs = new WorkspaceRuns({
    runs: new TauriRunStore(ipc, location),
    definitions: new TauriDefinitionStore(files, location),
    folder: location,
    onFocus: (listener) => focusOf(window, listener),
    // Looked up on the first answer: the page's engine is provided after the runs.
    send: (...answer) => (remoteEngine ?? services.get(engineServiceKey)).send(...answer),
    ...(remoteEngine === undefined ? {} : { waiting: () => remoteEngine.waiting() }),
  });
  services.provide(RunsSourceService, runs);
  services.provide(InboxRunsService, runs);
  services.provide(SandboxRefusalsService, new WorkspaceSandboxRefusals(runs));
  services.provide(
    InboxNoticesService,
    new WorkspaceNotices({
      runs,
      storage: storageOf(window),
      location,
      now: () => new Date(),
    }),
  );
}

/** Calls `listener` whenever the page's window comes to the front; returns a function that stops it. */
function focusOf(window: object, listener: () => void): () => void {
  if (!(window instanceof EventTarget)) return () => {};
  window.addEventListener("focus", listener);
  return () => window.removeEventListener("focus", listener);
}

/** The window's local storage, or `undefined` when it has none or won't give it. */
function storageOf(window: object): Storage | undefined {
  try {
    return "localStorage" in window ? (window.localStorage as Storage) : undefined;
  } catch {
    return undefined;
  }
}
