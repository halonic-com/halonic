// The page's own engine of one open folder (`studio.engine-service`): the shell's stores, the
// keychain and the folder's trust, with the agent host's harnesses and connectors where it runs.

import {
  TauriDefinitionStore,
  TauriEngineLock,
  type TauriFileShell,
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
import { EngineService } from "../engine/engine-service.ts";
import { windowKeyOriginPrompt } from "../engine/key-origin-prompt.ts";
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
  /** Hears when another process took the workspace's engine lock over. */
  readonly onEngineLockLost?: (() => void) | undefined;
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
    secrets: shellKeychain(ipc),
    keyOrigins: shellKeyOrigins(ipc),
    keyOriginPrompt: windowKeyOriginPrompt(services, ipc),
    http: new ShellHttpClient(ipc),
    clock: systemClock,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isTrusted: async (workspace) => (await trust.checkLoaded(workspace)).status === "trusted",
    mayStart: (workspace) => trust.mayStart(workspace),
    isTrustedNow: () => trust.isTrusted(),
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
              onWaiting: refusals.recordWaitingOf,
            }),
        }),
  });
}
