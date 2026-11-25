import type { MessagingId, MessagingSourceState } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * One connection to a place where agents run, such as one Paperclip instance and company, as
 * Settings lists it. It carries no key and nothing a provider reads: the key stays in the engine
 * (ADR 2026-11-24, agent messaging).
 */
export interface AgentConnection {
  /** The same ID as the connection's `MessagingSource`. */
  readonly id: MessagingId;
  /** The provider's kind, for an icon: "paperclip". Never parsed. */
  readonly provider: string;
  /** What the user reads, such as "Paperclip · Halonic · Board Supervisor". */
  readonly label: string;
  /**
   * Whom the connection is signed in as, such as "Board Supervisor", once the engine read it, so
   * two accounts on one Paperclip can be told apart.
   */
  readonly userName?: string;
  /** The address its sign-in goes to, such as `https://paperclip.acme.test`. */
  readonly address: string;
  readonly state: MessagingSourceState;
  /** When its key expires, as ISO text, when the engine knows it. */
  readonly keyExpiresAt?: string;
}

/** Why a sign-in was refused, before it started or once it was approved. */
export type SignInRefusal =
  /** The address isn't one the engine may sign in to. */
  | "address-not-allowed"
  /** Nothing answered at the address. */
  | "unreachable"
  /** The person who approved doesn't belong to the connection's company. */
  | "other-company";

/** How a sign-in ended. */
export type SignInResult =
  | { readonly outcome: "connected"; readonly connection: AgentConnection }
  /** Its 10 minutes passed before anyone approved it. */
  | { readonly outcome: "expired" }
  /** It was cancelled, here or at the approval page. */
  | { readonly outcome: "cancelled" }
  /**
   * The board approved, but the keychain didn't take the key, so the engine
   * revoked it and nothing is kept (Liam's option 1, HAL-17439).
   */
  | { readonly outcome: "key-not-saved" }
  | {
      readonly outcome: "refused";
      /** Only the approver can be refused once the sign-in started. */
      readonly reason: "other-company";
      /** The connection's company, from the workspace's connection file, when the engine knows it. */
      readonly company?: string;
    };

/** How long a sign-in waits for approval: Paperclip's challenge lifetime (HAL-17423). */
export const signInLimitMs = 10 * 60 * 1000;

/**
 * A sign-in that waits for the board's approval. The engine holds its key in memory and drops it
 * when the sign-in is cancelled or expires.
 */
export interface SignInChallenge {
  /** The random words Studio shows and the approval page shows too, so the board approves only this one. */
  readonly phrase: string;
  /** The approval page, which Studio opens in the browser. */
  readonly approvalUrl: string;
  /** When the sign-in ends unless approved, as ISO text: 10 minutes after it started. */
  readonly expiresAt: string;
  /** Settles once the sign-in ends. It never rejects. */
  readonly result: Promise<SignInResult>;
  /** Cancels the sign-in at the server; `result` then settles as `cancelled`. */
  cancel(): Promise<void>;
}

/** What starting a sign-in did: a challenge to approve, or why none could start. */
export type SignInStart =
  | { readonly outcome: "started"; readonly challenge: SignInChallenge }
  | { readonly outcome: "refused"; readonly reason: SignInRefusal };

/** What Disconnect did. A key the server didn't revoke stays valid until `validUntil` (ISO text). */
export type DisconnectResult =
  | { readonly revoked: true }
  | { readonly revoked: false; readonly validUntil: string };

/**
 * The engine's connections and their sign-in, as Studio's Connect dialog and Settings use them.
 * Connecting is always the person's action: nothing here starts by itself.
 */
export interface AgentConnections {
  /** The connections, in the order Settings lists them. */
  list(): Promise<readonly AgentConnection[]>;
  /** Calls `listener` when the list or a state changes. Returns the function that stops it. */
  subscribe(listener: () => void): () => void;
  /**
   * Starts a sign-in at `address`, for a new connection or, with `connection`, again for one
   * that was signed out. It rejects only when the engine can't be asked at all.
   */
  signIn(request: {
    readonly address: string;
    readonly connection?: MessagingId;
  }): Promise<SignInStart>;
  /**
   * Revokes the connection's key, then deletes it and its cache: both are deleted even when the
   * revoke fails, which the answer says.
   */
  disconnect(connection: MessagingId): Promise<DisconnectResult>;
}

/**
 * How Studio's features connect agent sources, whoever serves them. Features reach the engine's
 * sign-in only through this key. Where no engine serves it yet, nothing provides it and Settings
 * shows no Connections section. Tests and the demo provide a `FakeAgentConnections`.
 */
export const AgentConnectionsService: ServiceKey<AgentConnections> =
  serviceKey<AgentConnections>("agent-connections");
