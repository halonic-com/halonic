import { AgentHostChat } from "@halonicjs/adapter-agent-host-client";
import {
  TauriDefinitionStore,
  type TauriFileShell,
  TauriInstructionTrustStore,
  TauriRecordStore,
  TauriRunStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import {
  InstructionTrustService,
  type ServiceRegistry,
  type WorkspaceScope,
  workspaceFilesKey,
} from "@halonicjs/app";
import { randomIds, systemClock } from "@halonicjs/std";
import { FilesHostService } from "@halonicjs/studio-feature-files/api";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";
import {
  InboxNoticesService,
  InboxRequestsService,
  InboxRunsService,
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
import {
  InstructionTrustHostService,
  RunStartHostService,
  RunsSourceService,
} from "@halonicjs/studio-feature-runs/api";
import { ChangesSourceService } from "@halonicjs/studio-feature-source-control/api";
import { WorkflowsHostService } from "@halonicjs/studio-feature-workflows/api";
import {
  ShellHttpClient,
  shellKeychain,
  type TauriIpc,
  tauriAgentHostTransport,
} from "@halonicjs/studio-services";
import { type GitAnswer, WorkspaceChanges } from "../changes/workspace-changes.ts";
import { EngineService, engineServiceKey } from "../engine/engine-service.ts";
import { WorkspaceFilesHost } from "../files/workspace-files-host.ts";
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
import { WorkspaceModelKeys } from "../models/workspace-model-keys.ts";
import { WorkspaceModelsFiles } from "../models/workspace-models-files.ts";
import { WorkspaceNoLimit } from "../models/workspace-no-limit.ts";
import { WorkspaceProviderCheck } from "../models/workspace-provider-check.ts";
import { providePlugins } from "../plugins/provide-plugins.ts";
import { WorkspaceRuns } from "../runs/workspace-runs.ts";
import { WorkspaceWorkflows } from "../workflows/workspace-workflows.ts";
import { WorkspaceInstructionTrust } from "./workspace-instruction-trust.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** What the services of one open folder read: the shell, the page's window and the folder. */
export interface FolderServiceParts {
  readonly ipc: TauriIpc;
  readonly files: TauriFileShell;
  readonly window: object;
  readonly trust: WorkspaceTrust;
  readonly location: string;
  /** The open workspace, whose files and events the Models feature reads. */
  readonly scope: WorkspaceScope;
  /**
   * Saves what is waiting through the workspace's save state, so the toolbar says "Saving…" and a
   * failure has its toast; rejects when the save fails. Absent: Run starts without waiting.
   */
  readonly settle?: () => Promise<void>;
}

/** Gives the folder in `location` the services its features read through the shell. */
export function provideFolderServices(
  services: ServiceRegistry,
  { ipc, files, window, trust, location, scope, settle }: FolderServiceParts,
): void {
  services.provide(
    ModelsFilesService,
    new WorkspaceModelsFiles({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
    }),
  );
  services.provide(
    FilesHostService,
    new WorkspaceFilesHost({
      store: new TauriDefinitionStore(files, location),
      files: services.get(workspaceFilesKey),
      onChange: (listener) => {
        const stops = [
          scope.events.on("files.changed", listener),
          scope.events.on("files.saved", listener),
        ];
        return () => {
          for (const stop of stops) stop();
        };
      },
    }),
  );
  services.provide(ModelKeysService, new WorkspaceModelKeys(shellKeychain(ipc)));
  services.provide(NoLimitMemoryService, new WorkspaceNoLimit(storageOf(window), location));
  services.provide(ProviderCheckService, new WorkspaceProviderCheck(new ShellHttpClient(ipc)));
  provideWorkspaceRuns(services, { ipc, files, window }, location);
  services.provide(
    InstructionTrustHostService,
    new WorkspaceInstructionTrust(
      new InstructionTrustService({
        store: new TauriInstructionTrustStore(ipc),
        clock: systemClock,
      }),
      location,
    ),
  );
  services.provide(
    ChangesSourceService,
    new WorkspaceChanges({
      git: async (args) =>
        (await ipc.invoke("git", { root: location, args: [...args] })) as GitAnswer,
      files: new TauriDefinitionStore(files, location),
      // `.studio/discarded`, which the folder's own store refuses as private.
      copies: new TauriDefinitionStore(files, location, { folder: "discarded" }),
      digest: webCryptoDigest,
      onFocus: (listener) => focusOf(window, listener),
      onFilesChanged: (listener) => scope.events.on("files.changed", listener),
    }),
  );
  const engine = services.provide(
    engineServiceKey,
    new EngineService({
      ipc,
      location,
      definitions: new TauriDefinitionStore(files, location),
      secrets: shellKeychain(ipc),
      http: new ShellHttpClient(ipc),
      clock: systemClock,
      isTrusted: async (workspace) => (await trust.checkLoaded(workspace)).status === "trusted",
      ids: randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), systemClock),
      setTimer: (callback, delayMs) => {
        const timer = setTimeout(callback, delayMs);
        return () => clearTimeout(timer);
      },
      newToken: () => crypto.randomUUID(),
      reportError: (error) => console.error("The engine", error),
    }),
  );
  const workflows = services.provide(
    WorkflowsHostService,
    new WorkspaceWorkflows({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
      runs: services.get(RunsSourceService),
      ...(settle === undefined ? {} : { settle }),
      engine,
    }),
  );
  // Run again on the run page starts a run the way the workflow page's Run does.
  const { startRun } = workflows;
  if (startRun !== undefined) {
    services.provide(RunStartHostService, {
      startRun: ({ hubId, workflowId }, input) =>
        startRun.call(workflows, { hubId, id: workflowId }, input),
    });
  }
  services.provide(
    InboxRequestsService,
    new WorkspaceRequests({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
      engine,
    }),
  );
  const transport = tauriAgentHostTransport(window);
  services.provide(
    LibraryItemsHostService,
    new WorkspaceLibraryItems({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
    }),
  );
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
          ? () => Promise.reject(new Error("Summarize needs the agent host, which isn't running."))
          : (provider, request) => new AgentHostChat(transport, location).chat(provider, request),
    }),
  );
  services.provide(
    NewCollectionHostService,
    new WorkspaceNewCollection({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
    }),
  );
  services.provide(
    NewConnectorHostService,
    new WorkspaceNewConnector({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
    }),
  );
  services.provide(
    NewSkillHostService,
    new WorkspaceNewSkill({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
    }),
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
  { ipc, files, window }: { ipc: TauriIpc; files: TauriFileShell; window: object },
  location: string,
): void {
  const runs = new WorkspaceRuns({
    runs: new TauriRunStore(ipc, location),
    definitions: new TauriDefinitionStore(files, location),
    onFocus: (listener) => focusOf(window, listener),
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
