import type { EngineLockLostKind } from "@halonicjs/adapter-fs-tauri";
import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import type { assembleEngine, ListedToolApprovalStore } from "@halonicjs/engine";
import type {
  Clock,
  DefinitionStore,
  HttpClient,
  IdGenerator,
  KeyOrigins,
  Secrets,
} from "@halonicjs/ports";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { PageEngineLock } from "./engine-lock.ts";
import type { KeyOriginPrompt } from "./key-origin-prompt.ts";
import type { RunVersionLoads } from "./page-run-versions.ts";
import type { LiveVersions } from "./page-versions.ts";
import type { EngineParts, StudioHarnessHost } from "./studio-harness-host.ts";

/** What an {@link EngineService} is built from. */
export interface EngineServiceOptions {
  /** The shell: its run, blob and record commands. */
  readonly ipc: TauriIpc;
  /** The workspace's engine lock, which the shell holds and renews. */
  readonly lock: PageEngineLock;
  /** The workspace folder, as the person opened it in the shell. */
  readonly location: string;
  /** The workspace's name, as the window shows it, for the refusal when another process holds the lock. */
  readonly name: string;
  /** The workspace's files, read when the engine opens. */
  readonly definitions: DefinitionStore;
  /**
   * The workspace's live version (`PageVersions`), which its routines come from. Left out, the
   * workspace has history off and everything comes from the saved files.
   */
  readonly versions?: LiveVersions;
  /** The keychain, as `Secrets`. */
  readonly secrets: Secrets;
  /**
   * The origins each key in the keychain may be sent to (HAL-11887). Asked on every model call
   * with a key; a key with a list goes only to those origins, a key without one keeps the trust rule.
   */
  readonly keyOrigins: KeyOrigins;
  /**
   * "Allow this address?" (HAL-11873): when a run a person started at this window is refused
   * because its key may not go to the provider's address, the engine asks here, saves only
   * that address and picks the model again. Left out, nothing is asked and the call fails.
   */
  readonly keyOriginPrompt?: KeyOriginPrompt;
  /** What the model providers call their servers with. */
  readonly http: HttpClient;
  readonly clock: Clock;
  /** The zone of a routine's schedule that names none: the computer's own. */
  readonly timeZone: string;
  /**
   * Whether the workspace, as the engine loaded it, is trusted on this computer. Asked on every
   * model call, so a provider's stored key goes to a non-default address only after a person
   * trusted exactly these files (HAL-11342), and right before each harness step (HAL-12811).
   */
  readonly isTrusted: (workspace: LoadedWorkspace) => Promise<boolean>;
  /**
   * Whether anything may start from the workspace, as the engine loaded it: it is trusted on this
   * computer, or it reaches only the test model. Asked when the engine opens and before each
   * start; a check that rejects is a no.
   */
  readonly mayStart: (workspace: LoadedWorkspace) => Promise<boolean>;
  /**
   * Whether the last check found the workspace trusted, for a start the shell refused because
   * the folder isn't open, which no new check can read: after Remove trust closed it, a no makes
   * that refusal the untrusted one, so the page offers **Review** (HAL-15695).
   */
  readonly isTrustedNow: () => boolean;
  /**
   * Calls `listener` whenever the workspace's trust may have changed, such as when a person
   * removes it; returns the way to stop. The open engine then asks {@link mayStart} again and
   * closes on a no (HAL-12799).
   */
  onTrustChange?(listener: () => void): () => void;
  readonly ids: IdGenerator;
  /** How the scheduler wakes itself up. */
  readonly setTimer: SetTimer;
  /** A new token for the routine state's leases. */
  readonly newToken: () => string;
  /** Hears each error the engine handles itself, such as a timer that will be retried. */
  reportError(error: unknown): void;
  /**
   * Hears once when the lock was lost, and which kind of loss, so the window can say this one
   * stopped.
   */
  onLockLost?(kind: EngineLockLostKind): void;
  /**
   * Builds the harness host on the agent host, when one runs (`openStudioHarnessHost`).
   * `engine` gives one run's bridge approvals and its phone's decisions,
   * the engine's once it is built, and the loaded workspace, the keychain
   * and the key check a sandboxed agent's provider key is served with.
   * Without it, a workflow with an agent in a harness is refused.
   */
  openHarnessHost?(engine: EngineParts): Promise<StudioHarnessHost>;
  /**
   * Builds the runs' connectors on the agent host, when one runs (`studioRunConnectors`), and
   * the approvals their listed tools are checked against, once per engine, while the engine lock
   * is held and before any run starts, so it may sweep what an earlier engine left. `versions` gives the
   * version each run read, which its connectors' files come from, and forgets it when the run
   * ends. Without it, a workflow with an agent that lists a connector is refused.
   */
  openRunConnectors?(versions: RunVersionLoads): Promise<StudioRunConnectors>;
}

/** What a run needs to start its connectors and to offer their tools. */
export interface StudioRunConnectors {
  /** The runs' connectors, as the executor takes them, and their close once it has closed. */
  readonly connectors: NonNullable<
    NonNullable<Parameters<typeof assembleEngine>[0]["executor"]["runs"]>["runConnectors"]
  > & { closeAll(): Promise<void> };
  /**
   * The approvals a person gave in the Library (`studio.workspace-listed-tools`): a listed tool
   * is offered to the model only once approved, and the others wait.
   */
  readonly listedToolApproval: ListedToolApprovalStore;
}
