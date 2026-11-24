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

/** How long a sign-in waits for approval, as Paperclip's CLI sign-in route gives it. */
const signInMs = 10 * 60 * 1000;

/** What a {@link FakeAgentConnections} starts with. */
export interface FakeAgentConnectionsOptions {
  readonly connections?: readonly AgentConnection[];
  /** The phrase every sign-in shows. Default "amber falcon river seven". */
  readonly phrase?: string;
  /** Where a sign-in's 10 minutes count from. Default the clock. */
  readonly now?: () => number;
  /** What `signIn` answers instead of starting, such as an address that isn't allowed. */
  readonly refuseStart?: SignInRefusal;
  /** What `disconnect` answers. Default a revoke that worked. */
  readonly disconnect?: DisconnectResult;
}

/** A sign-in the fake started and hasn't ended yet. */
interface Pending {
  readonly request: { readonly address: string; readonly connection?: MessagingId };
  readonly end: (result: SignInResult) => void;
}

/**
 * An `AgentConnections` with no engine behind it, for tests and the demo until the host's sign-in
 * is wired (HAL-17439). It counts every call, and the test decides how a sign-in ends with
 * `approve`, `refuse` and `expire`. It never runs a timer: the dialog counts the 10 minutes.
 */
export class FakeAgentConnections implements AgentConnections {
  /** Every `signIn` request, in order. */
  readonly signIns: { readonly address: string; readonly connection?: MessagingId }[] = [];
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

  async signIn(request: {
    readonly address: string;
    readonly connection?: MessagingId;
  }): Promise<SignInStart> {
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
      expiresAt: new Date(now() + signInMs).toISOString(),
      result,
      cancel: async () => {
        if (this.pending !== pending) return;
        this.cancels++;
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

  /** Ends the waiting sign-in as refused, such as by someone outside the company. */
  refuse(reason: SignInRefusal): void {
    this.end({ outcome: "refused", reason });
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
