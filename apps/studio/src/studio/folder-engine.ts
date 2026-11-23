// The page's own engine of one open folder (`studio.engine-service`): the shell's stores, the
// keychain and the folder's trust, with the agent host's harnesses and connectors where it runs.

import {
  type EngineLockLostKind,
  TauriDefinitionStore,
  TauriEngineLock,
  type TauriFileShell,
  TauriFolderReader,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import type { InstructionTrustService, ServiceRegistry } from "@halonicjs/app";
import { randomIds, systemClock } from "@halonicjs/std";
import type { RefusalsFeed } from "@halonicjs/studio-feature-library/api";
import {
  ShellHttpClient,
  shellKeychain,
  shellKeyOrigins,
  type TauriIpc,
  type tauriAgentHostTransport,
  tokenStoreKey,
} from "@halonicjs/studio-services";
import type { GitAnswer } from "../changes/workspace-changes.ts";
import { EngineService, type EngineServiceOptions } from "../engine/engine-service.ts";
import { windowKeyOriginPrompt } from "../engine/key-origin-prompt.ts";
import { PageVersions } from "../engine/page-versions.ts";
import { openStudioHarnessHost } from "../engine/studio-harness-host.ts";
import { openStudioRunConnectors } from "./open-run-connectors.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** What the folder's engine is built on. */
export interface FolderEngineParts {
  readonly ipc: TauriIpc;
  readonly files: TauriFileShell;
  readonly trust: WorkspaceTrust;
  readonly location: string;
  /** The workspace's name, as the window shows it. */
  readonly name: string;
  /** The person's trusted instructions, which a harness run's instructions are checked against. */
  readonly instructionTrust: InstructionTrustService;
  /** The agent host, where it runs: without it no harness agent and no connector starts. */
  readonly transport: ReturnType<typeof tauriAgentHostTransport>;
  /** The Library's list of what a run's turns left waiting. */
  readonly refusals: RefusalsFeed;
  /** Hears when the workspace's engine lock was lost, and which kind of loss. */
  readonly onEngineLockLost?: ((kind: EngineLockLostKind) => void) | undefined;
}

/** The engine of the folder in `location`, run in the page. */
export function folderEngine(services: ServiceRegistry, parts: FolderEngineParts): EngineService {
  const { ipc, files, trust, location, name, instructionTrust, transport, refusals } = parts;
  const { onEngineLockLost } = parts;
  return new EngineService({
    ipc,
    lock: new TauriEngineLock(files, location),
    location,
    name,
    definitions: new TauriDefinitionStore(files, location),
    versions: new PageVersions({
      git: async (args) =>
        (await ipc.invoke("git", { root: location, args: [...args] })) as GitAnswer,
      // The folder's own entries, `.git` included, which the workspace's files never list.
      hasGitFolder: async () =>
        (await new TauriFolderReader(ipc, location).entries(undefined, { recursive: false })).some(
          (entry) => entry.path === ".git",
        ),
    }),
    secrets: shellKeychain(ipc),
    keyOrigins: shellKeyOrigins(ipc),
    keyOriginPrompt: windowKeyOriginPrompt(services, ipc),
    http: new ShellHttpClient(ipc),
    clock: systemClock,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...engineTrustOptions(trust),
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
          openRunConnectors: (versions) =>
            openStudioRunConnectors({
              versions,
              ipc,
              files,
              location,
              transport,
              trust,
              tokens: services.get(tokenStoreKey),
              onWaiting: refusals.recordWaitingOf,
            }),
        }),
  });
}

/**
 * How the folder's engine asks the folder's trust. Every check is of a workspace the engine
 * loaded, often its copy of the files as saved at the latest start, so none writes the trust
 * record (HAL-16381).
 */
export function engineTrustOptions(
  trust: WorkspaceTrust,
): Pick<EngineServiceOptions, "isTrusted" | "mayStart" | "isTrustedNow" | "onTrustChange"> {
  return {
    isTrusted: async (workspace) => (await trust.checkLoaded(workspace)).status === "trusted",
    mayStart: (workspace) => trust.mayStart(workspace),
    isTrustedNow: () => trust.isTrusted(),
    // Removing the trust here or in Settings › Trusted sources checks it again.
    onTrustChange: (listener) => trust.subscribe(listener),
  };
}
