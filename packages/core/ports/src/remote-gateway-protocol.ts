import type {
  GatewayMessagingClientMessage,
  GatewayMessagingHostMessage,
} from "./remote-gateway-messaging.ts";
import { gatewayMessagingRefusalCodes } from "./remote-gateway-messaging.ts";

/**
 * The remote gateway protocol: what a phone and the desktop host's remote
 * gateway say to each other, inside the end-to-end session (requirement
 * `ports.remote-gateway-protocol`). It covers sessions, their events,
 * approvals and prompt input, the end of a pairing, and (since version 4) the
 * Inbox, Messenger and team status, and nothing else. Each
 * message is one JSON object in one Noise transport message; nothing here is
 * ever sent in cleartext. The session around it is in
 * `remote-gateway-session.ts` (ADR "Pairing and the end-to-end session").
 */

/**
 * The message version: which messages and fields the two sides exchange.
 * Both sides send it in `hello` and `welcome`, inside the end-to-end session,
 * so nobody in the middle can change it. It is not the session version the
 * Noise prologue names (`gatewaySessionVersion`), which changes only with the
 * handshake or the framing; so a phone and a host of different message
 * versions still connect and can say so. The host speaks the versions in
 * {@link gatewayHostProtocolVersions} and answers in the one the `hello`
 * named; it answers any other with `unsupported-version` and closes. The
 * phone closes on a `welcome` of another version than its `hello`'s.
 *
 * Version 3 added `answersRisky` and the pushed `sessions`. Version 4 added
 * the Inbox, Messenger and team status (`remote-gateway-messaging.ts`).
 * Version 5 added message reactions (HAL-19139).
 */
export const gatewayProtocolVersion = 5;

/**
 * The versions the host speaks, newest first. It still speaks version 4, so a
 * phone not yet updated keeps its Inbox and Messenger, without reactions.
 */
export const gatewayHostProtocolVersions = [5, 4] as const;

/** The first version with message reactions: `msg-react` and the `reactions` read. */
export const gatewayReactionsProtocolVersion = 5;

/**
 * The versions a phone says `hello` with, in order, when the computer answers
 * `unsupported-version`: one step down per session, starting again from the
 * top on the next. Version 4 has no reactions; version 3 shows only Agents.
 */
export const gatewayPhoneProtocolVersions = [5, 4, 3] as const;

/**
 * The version a phone falls back to last, for one release: it shows only
 * Agents there. The host doesn't speak it.
 */
export const gatewayFallbackProtocolVersion = 3;

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
 * characters from `A`–`Z`, `a`–`z`, `0`–`9`, `_` and `-`. Messaging ids
 * follow {@link gatewayMessagingIdPattern} instead.
 */
export const gatewayMaxIdLength = 128;

/**
 * The longest messaging id: an Inbox item, a conversation, an addressee or a
 * pull request, typed `MessagingId`. The providers make these ids, not the
 * phone or the host, so they get their own rule, {@link gatewayMessagingIdPattern}.
 */
export const gatewayMaxMessagingIdLength = 256;

/**
 * The rule for a messaging id: 1 to {@link gatewayMaxMessagingIdLength}
 * characters that `encodeURIComponent` leaves as they are, plus `%` and `:`,
 * because a provider joins encoded parts with `:`, as in
 * `paperclip:acme:pull:acme%2Fapp:11`.
 */
export const gatewayMessagingIdPattern = new RegExp(
  `^[A-Za-z0-9_.!~*'()%:-]{1,${gatewayMaxMessagingIdLength}}$`,
);

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
  /** The connector the tool comes from, when it comes from one, so the phone can say which connector asks. */
  readonly connector?: string;
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
  ...gatewayMessagingRefusalCodes,
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
    }
  | GatewayMessagingClientMessage;

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
 * - `unsupported-version`: a `hello` whose `version` isn't one of
 *   {@link gatewayHostProtocolVersions};
 * - `malformed`: anything else that isn't exactly one listed message. That is
 *   bytes that aren't valid UTF-8, text that isn't one JSON object, an
 *   unlisted `type`, a missing, extra or wrongly typed field, an id that
 *   breaks {@link gatewayMaxIdLength} (a messaging id:
 *   {@link gatewayMessagingIdPattern}), an `afterSeq` that isn't a whole number
 *   from 0 up to the session's `lastSeq`, a prompt `text` that is empty or
 *   longer than {@link gatewayMaxPromptLength}, a `msg-send` body outside
 *   that limit, a `msg-search` text that is empty or longer than
 *   `gatewayMaxSearchLength`, a `msg-answer` without `confirmed: true`, a
 *   `team-read` `range` with anything but `spend`, any message before `hello`,
 *   a second `hello`, and a reactions message after a version 4 `hello`.
 *
 * A well-formed message the host won't carry out gets an `error` with a code
 * from {@link gatewayRefusalCodes} and its `replyTo`, and the connection
 * stays open.
 *
 * **Pushed list.** When the person turns "Let phones answer risky approvals"
 * on or off, the host sends `sessions` without `replyTo`, always the full
 * list, to every connection past `welcome`. The phone replaces its list with
 * it; it drops a push before `welcome`, and a `sessions` with a `replyTo`
 * that answers nothing it sent.
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
      /** The `list-sessions` this answers; absent when the host pushes the list. */
      readonly replyTo?: string;
      readonly sessions: readonly GatewaySession[];
      /**
       * Whether "Let phones answer risky approvals" was on when the host made
       * this list. Only a hint for what the phone shows: the host checks the
       * switch again for every answer, and that check is the gate.
       */
      readonly answersRisky: boolean;
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
    }
  | GatewayMessagingHostMessage;
