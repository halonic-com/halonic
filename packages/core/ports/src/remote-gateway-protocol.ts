/**
 * The remote gateway protocol: what a phone and the desktop host's remote
 * gateway say to each other, inside the end-to-end session (requirement
 * `ports.remote-gateway-protocol`). It covers sessions, their events,
 * approvals and prompt input, and nothing else. Each message is one JSON
 * object in one session frame.
 */

/** The protocol version. Both sides send it in `hello` and `welcome`; a host speaks exactly one. */
export const gatewayProtocolVersion = 1;

/**
 * The largest message either side accepts, in bytes of its UTF-8 JSON. A
 * larger one is refused: the host sends `error` with `too-large` and closes.
 */
export const gatewayMaxMessageBytes = 64 * 1024;

/**
 * The longest prompt text, in UTF-16 code units. A prompt this long of
 * ordinary text fits in one message; the message limit still applies.
 */
export const gatewayMaxPromptLength = 16_000;

/** A session as the phone lists it. `waiting` means an approval waits for an answer. */
export interface GatewaySession {
  readonly id: string;
  readonly title: string;
  readonly state: "running" | "waiting" | "done" | "failed";
  /** The sequence number of the session's newest event. */
  readonly lastSeq: number;
  readonly updatedAt: string;
}

/**
 * An approval the phone may show. `risky` approvals (a shell command, a file
 * write, a secret, leaving the sandbox) need a biometric unlock on the phone,
 * and the host refuses an answer to them with `not-allowed-remotely` unless
 * the host allows remote answers for them.
 */
export interface GatewayApproval {
  readonly id: string;
  readonly summary: string;
  readonly risk: "normal" | "risky";
}

/**
 * What happened in a session, as narrow as the phone needs. The host shortens
 * a `message` text that would make its event larger than
 * {@link gatewayMaxMessageBytes} and ends it with "…"; the full text stays on
 * the desktop.
 */
export type GatewayEventBody =
  | { readonly type: "message"; readonly role: "user" | "agent"; readonly text: string }
  | { readonly type: "state"; readonly state: GatewaySession["state"] }
  | { readonly type: "approval-requested"; readonly approval: GatewayApproval }
  | {
      readonly type: "approval-settled";
      readonly approvalId: string;
      readonly decision: "approve" | "deny";
    };

/** Why the host refused a message. Studio words each code. */
export const gatewayErrorCodes = [
  "malformed",
  "too-large",
  "unsupported-version",
  "unknown-session",
  "unknown-approval",
  "not-allowed-remotely",
  "history-gone",
] as const;

/** One of {@link gatewayErrorCodes}. */
export type GatewayErrorCode = (typeof gatewayErrorCodes)[number];

/**
 * What the phone sends. `id` is the phone's own id for the message; the
 * host's `ok` or `error` names it in `replyTo`.
 *
 * - `hello` comes first on every connection, also after a reconnect.
 * - `watch` streams a session's events after `afterSeq` (0 for all of them),
 *   then each new one. After a reconnect the phone watches again from the
 *   last `seq` it saw, which is how a session resumes. When those events are
 *   gone, the host answers `history-gone` and the phone watches from 0.
 */
export type GatewayClientMessage =
  | { readonly type: "hello"; readonly id: string; readonly version: number }
  | { readonly type: "list-sessions"; readonly id: string }
  | {
      readonly type: "watch";
      readonly id: string;
      readonly sessionId: string;
      readonly afterSeq: number;
    }
  | { readonly type: "unwatch"; readonly id: string; readonly sessionId: string }
  | {
      readonly type: "answer-approval";
      readonly id: string;
      readonly sessionId: string;
      readonly approvalId: string;
      readonly decision: "approve" | "deny";
    }
  | {
      readonly type: "prompt";
      readonly id: string;
      readonly sessionId: string;
      readonly text: string;
    };

/**
 * What the host sends. Any message the host can't parse, that is too large,
 * whose `type` isn't listed or that comes before `hello` gets one `error` and
 * the host closes the connection. An `error` about a known message with a
 * wrong session or approval leaves the connection open.
 */
export type GatewayHostMessage =
  | {
      readonly type: "welcome";
      readonly replyTo: string;
      readonly version: number;
      readonly maxMessageBytes: number;
    }
  | {
      readonly type: "sessions";
      readonly replyTo: string;
      readonly sessions: readonly GatewaySession[];
    }
  | {
      readonly type: "event";
      readonly sessionId: string;
      readonly seq: number;
      readonly at: string;
      readonly body: GatewayEventBody;
    }
  | { readonly type: "ok"; readonly replyTo: string }
  | { readonly type: "error"; readonly replyTo?: string; readonly code: GatewayErrorCode };
