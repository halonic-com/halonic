/**
 * The remote gateway protocol: what a phone and the desktop host's remote
 * gateway say to each other, inside the end-to-end session (requirement
 * `ports.remote-gateway-protocol`). It covers sessions, their events,
 * approvals and prompt input, the end of a pairing, and nothing else. Each
 * message is one JSON object in one Noise transport message; nothing here is
 * ever sent in cleartext. The session around it is in
 * `remote-gateway-session.ts` (ADR "Pairing and the end-to-end session").
 */

/**
 * The protocol version. Both sides send it in `hello` and `welcome`, and the
 * Noise prologue names it too, so a peer of another version fails the
 * handshake. A host speaks exactly one and there is no negotiation. The host
 * answers a `hello` with another version with `unsupported-version` and
 * closes; the phone closes on a `welcome` with another version.
 */
export const gatewayProtocolVersion = 2;

/**
 * The largest message either side accepts, in bytes of its UTF-8 JSON: one
 * Noise transport message (65,535 bytes) less its 16-byte tag. A larger one is
 * refused: the host sends `error` with `too-large` and closes. The host checks
 * the size before it parses.
 */
export const gatewayMaxMessageBytes = 65_535 - 16;

/**
 * The longest prompt text, in UTF-16 code units. It is set from the worst
 * case: JSON writes a control character or a lone surrogate as six bytes, so
 * 10,000 of them take 60,000 bytes and still fit in one message with the
 * envelope. A prompt within this length never gets `too-large`.
 */
export const gatewayMaxPromptLength = 10_000;

/**
 * The longest id, the phone's or the host's. Every id is 1 to this many
 * characters from `A`–`Z`, `a`–`z`, `0`–`9`, `_` and `-`.
 */
export const gatewayMaxIdLength = 128;

/**
 * The most sessions one connection may watch at once. A `watch` for one more
 * gets `too-many-watches` and leaves the connection open.
 */
export const gatewayMaxWatches = 16;

/**
 * The most bytes the host holds unsent for one connection. A phone that
 * reads more slowly than its sessions produce events is closed when this is
 * exceeded, never buffered without limit; it resumes by watching again.
 */
export const gatewayMaxBufferedBytes = 1024 * 1024;

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
 * An approval the phone may show. Only the host sets `risk`; the phone's
 * answer carries none. A `risky` approval (a shell command, a file write, a
 * secret, leaving the sandbox) is refused by default: every answer to it
 * gets `not-allowed-remotely` unless the person has allowed remote answers
 * to risky approvals for this host on the desktop. The phone asks for a
 * biometric unlock before it sends one, but the host can't check that and
 * never treats it as proof.
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

/**
 * Why the host refused a message and closed the connection. Such an `error`
 * has no `replyTo`, since the message it answers may not have parsed.
 */
export const gatewayClosingErrorCodes = ["malformed", "too-large", "unsupported-version"] as const;

/** Why the host refused a well-formed message and kept the connection open. */
export const gatewayRefusalCodes = [
  "unknown-session",
  "unknown-approval",
  "not-allowed-remotely",
  "history-gone",
  "too-many-watches",
] as const;

/** Every error code, closing ones first. Studio words each code. */
export const gatewayErrorCodes = [...gatewayClosingErrorCodes, ...gatewayRefusalCodes] as const;

/** One of {@link gatewayErrorCodes}. */
export type GatewayErrorCode = (typeof gatewayErrorCodes)[number];

/**
 * What the phone sends. `id` is the phone's own id for the message; the
 * host's `ok` or refusal names it in `replyTo`.
 *
 * - `hello` comes first on every connection, also after a reconnect, and
 *   only once.
 * - `watch` streams a session's events after `afterSeq`, then each new one.
 *   `afterSeq` 0 starts from the oldest event the host keeps; the host keeps
 *   every event from the oldest `approval-requested` that isn't settled.
 *   A `watch` for a session already watched replaces that watch.
 * - **Resume.** Each session's `seq` starts at 1 and grows by one per event,
 *   never reused. After a reconnect the phone watches again from the last
 *   `seq` it saw. An `afterSeq` above the session's `lastSeq` is `malformed`.
 *   When the events after `afterSeq` are gone, the host answers
 *   `history-gone`. On `history-gone`, or a gap in `seq` within a watch, the
 *   phone drops what it holds for the session and watches from 0. It shows
 *   an approval only from an `approval-requested` event not followed by its
 *   `approval-settled`; an answer to a settled or unknown approval gets
 *   `unknown-approval`.
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
 * Why the host ended a pairing after the phone's message 3 decrypted: the
 * person pressed Don't allow, or didn't press Allow in time. Refusals before
 * that are cleartext frames (`PairRefusedReason` in `remote-gateway-session.ts`).
 */
export type GatewayPairDeniedReason = "denied" | "timed-out";

/**
 * What the host sends.
 *
 * **Pairing and reconnecting.** At the end of a pairing the host sends
 * `paired` once the person pressed Allow, or `pair-refused` and closes; the
 * phone sends nothing before either. After a reconnect the host sends
 * `not-paired` and closes when it doesn't know the phone's key; it sends it
 * only after its handshake message has proved who it is, and also at once
 * when the phone is revoked while connected. Then, and after `paired`, the
 * phone's first message is `hello`.
 *
 * **Error and close.** The host sends one `error` with a code from
 * {@link gatewayClosingErrorCodes}, without `replyTo`, then closes the
 * connection, for:
 * - `too-large`: more than {@link gatewayMaxMessageBytes} bytes;
 * - `unsupported-version`: a `hello` whose `version` isn't
 *   {@link gatewayProtocolVersion};
 * - `malformed`: anything else that isn't exactly one listed message. That is
 *   bytes that aren't valid UTF-8, text that isn't one JSON object, an
 *   unlisted `type`, a missing, extra or wrongly typed field, an id that
 *   breaks {@link gatewayMaxIdLength}, an `afterSeq` that isn't a whole number
 *   from 0 up to the session's `lastSeq`, a prompt `text` that is empty or
 *   longer than {@link gatewayMaxPromptLength}, any message before `hello`,
 *   and a second `hello`.
 *
 * A well-formed message the host won't carry out gets an `error` with a code
 * from {@link gatewayRefusalCodes} and its `replyTo`, and the connection
 * stays open.
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
  | { readonly type: "paired" }
  | { readonly type: "pair-refused"; readonly reason: GatewayPairDeniedReason }
  | { readonly type: "not-paired" }
  | {
      readonly type: "error";
      readonly code: (typeof gatewayClosingErrorCodes)[number];
    }
  | {
      readonly type: "error";
      readonly replyTo: string;
      readonly code: (typeof gatewayRefusalCodes)[number];
    };
