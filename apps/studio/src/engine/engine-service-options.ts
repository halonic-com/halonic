import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
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
import type { EngineDecisions, StudioHarnessHost } from "./studio-harness-host.ts";

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
  /** The keychain, as `Secrets`. */
  readonly secrets: Secrets;
  /**
   * The origins each key in the keychain may be sent to (HAL-11887). Asked on every model call
   * with a key; a key with a list goes only to those origins, a key without one keeps the trust rule.
   */
  readonly keyOrigins: KeyOrigins;
  /** What the model providers call their servers with. */
  readonly http: HttpClient;
  readonly clock: Clock;
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
  /** Hears once when another process took the lock over, so the window can say this one stopped. */
  onLockLost?(): void;
  /**
   * Builds the harness host on the agent host, when one runs (`openStudioHarnessHost`).
   * `decisions` gives one run's bridge approvals and its phone's decisions,
   * the engine's once it is built. Without it, a workflow with an agent in a
   * harness is refused.
   */
  openHarnessHost?(decisions: EngineDecisions): Promise<StudioHarnessHost>;
}
