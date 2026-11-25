import type { MessagingId } from "@halonicjs/ports";
import type {
  AgentConnection,
  AgentConnections,
  DisconnectResult,
  SignInChallenge,
  SignInRefusal,
  SignInResult,
  SignInStart,
} from "./agent-connections.ts";
import { signInLimitMs } from "./agent-connections.ts";

/** What a {@link FakeAgentConnections} starts with. */
export interface FakeAgentConnectionsOptions {
  readonly connections?: readonly AgentConnection[];
  /** The phrase every sign-in shows. Default "amber falcon river seven". */
  readonly phrase?: string;
  /** Where a sign-in's 10 minutes count from. Default the clock. */
  readonly now?: () => number;
  /** What `signIn` answers instead of starting, such as an address that isn't allowed. */
  readonly refuseStart?: SignInRefusal;
  /** When true, every cancel fails, as when the engine doesn't answer. */
  readonly cancelFails?: boolean;
  /** What `disconnect` answers. Default a revoke that worked. */
  readonly disconnect?: DisconnectResult;
}

/** A sign-in the fake started and hasn't ended yet. */
/** What a sign-in was started with. */
type SignInRequest = Parameters<AgentConnections["signIn"]>[0];

interface Pending {
  readonly request: SignInRequest;
  readonly end: (result: SignInResult) => void;
}

/**
 * An `AgentConnections` with no engine behind it, for tests and the demo until the host's sign-in
 * is wired (HAL-17439). It counts every call, and the test decides how a sign-in ends with
 * `approve`, `refuse` and `expire`. It never runs a timer: the dialog counts the 10 minutes.
 */
export class FakeAgentConnections implements AgentConnections {
  /** Every `signIn` request, in order. */
  readonly signIns: SignInRequest[] = [];
  /** How many times a sign-in was cancelled. */
  cancels = 0;
  /** Every connection `disconnect` was called for, in order. */
  readonly disconnects: MessagingId[] = [];

  private readonly options: FakeAgentConnectionsOptions;
  private connections: AgentConnection[];
  private readonly listeners = new Set<() => void>();
  private pending: Pending | undefined;

  constructor(options: FakeAgentConnectionsOptions = {}) {
    this.options = options;
    this.connections = [...(options.connections ?? [])];
  }

  async list(): Promise<readonly AgentConnection[]> {
    return this.connections;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signIn(request: SignInRequest): Promise<SignInStart> {
    this.signIns.push(request);
    if (this.options.refuseStart !== undefined) {
      return { outcome: "refused", reason: this.options.refuseStart };
    }
    this.end({ outcome: "cancelled" });
    const now = this.options.now ?? Date.now;
    let end: (result: SignInResult) => void = () => undefined;
    const result = new Promise<SignInResult>((resolve) => {
      end = resolve;
    });
    const pending: Pending = { request, end };
    this.pending = pending;
    const challenge: SignInChallenge = {
      phrase: this.options.phrase ?? "amber falcon river seven",
      approvalUrl: `${request.address}/cli-auth/fake-challenge`,
      expiresAt: new Date(now() + signInLimitMs).toISOString(),
      result,
      cancel: async () => {
        if (this.pending !== pending) return;
        this.cancels++;
        if (this.options.cancelFails === true) throw new Error("The fake engine didn't answer.");
        this.end({ outcome: "cancelled" });
      },
    };
    return { outcome: "started", challenge };
  }

  async disconnect(connection: MessagingId): Promise<DisconnectResult> {
    this.disconnects.push(connection);
    this.connections = this.connections.filter((known) => known.id !== connection);
    this.changed();
    return this.options.disconnect ?? { revoked: true };
  }

  /** Whether a sign-in waits for approval now. */
  get waiting(): boolean {
    return this.pending !== undefined;
  }

  /** Approves the waiting sign-in as `label`: its connection is now online. */
  approve(label = "Paperclip · Halonic"): void {
    const pending = this.pending;
    if (pending === undefined) throw new Error("No sign-in waits for approval");
    const id = pending.request.connection ?? `fake:${this.connections.length + 1}`;
    const connection: AgentConnection = {
      id,
      provider: "paperclip",
      label,
      address: pending.request.address,
      state: { kind: "online", asOf: new Date((this.options.now ?? Date.now)()).toISOString() },
    };
    this.connections = [...this.connections.filter((known) => known.id !== id), connection];
    this.end({ outcome: "connected", connection });
    this.changed();
  }

  /** Ends the waiting sign-in as refused: someone outside the company, `company`, approved it. */
  refuse(reason: "other-company", company?: string): void {
    this.end(
      company === undefined
        ? { outcome: "refused", reason }
        : { outcome: "refused", reason, company },
    );
  }

  /** Ends the waiting sign-in as approved, but with a keychain that didn't take the key. */
  failKeychain(): void {
    this.end({ outcome: "key-not-saved" });
  }

  /** Ends the waiting sign-in as the server does after its 10 minutes. */
  expire(): void {
    this.end({ outcome: "expired" });
  }

  private end(result: SignInResult): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.end(result);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
