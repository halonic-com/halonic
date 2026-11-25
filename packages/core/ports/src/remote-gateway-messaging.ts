/**
 * The messages message version 4 of the remote gateway protocol adds: the
 * Inbox and Messenger (`msg-*`) and team status (`team-*`), read through the
 * desktop's ports (requirement `ports.remote-gateway-protocol`, architecture
 * note section 2.2 on HAL-17511). `remote-gateway-protocol.ts` joins them to
 * the version 3 messages, which stay exactly as they were.
 *
 * Every value is a port type, so nothing here has room for a key, a header or
 * a raw answer from Paperclip.
 */

import type { AgentMessaging, AnswerResult, MessagingId, SendResult } from "./agent-messaging.ts";
import type { SpendRange, TeamStatus } from "./team-status.ts";

/**
 * The longest search text from a phone, in UTF-16 code units (Julian,
 * HAL-17540), so a stolen phone can't turn one message into a heavy search.
 */
export const gatewayMaxSearchLength = 200;

/** The most agents a phone's `msg-send` may name in `to`: a channel's most members. */
export const gatewayMaxAddressees = 8;

/** The lists a `msg-read` reads whole, a page at a time. */
export const gatewayMessagingLists = [
  "sources",
  "agents",
  "conversations",
  "inbox",
  "work",
] as const;

/** The team-status reads a `team-read` names, besides one pull request. */
export const gatewayTeamLists = ["parts", "spend", "seats", "pull-requests", "queue"] as const;

/**
 * An answer to an inbox item from the phone: an option or a written reply.
 * An action item's stepper runs only in Studio on the desktop.
 */
export type GatewayInboxAnswer =
  | { readonly kind: "option"; readonly option: string; readonly note?: string }
  | { readonly kind: "reply"; readonly text: string };

/**
 * What a phone may send in version 4 besides the version 3 messages.
 *
 * - `msg-read` reads a list a page at a time: `cursor` is the `more` of the
 *   page before, opaque to the phone. For `messages` the newest page comes
 *   first and `before` is that cursor.
 * - `msg-answer` carries `confirmed: true`: the phone sends it only after
 *   its owner check passed for this answer (P2). The host never treats that
 *   as proof, and refuses a risky item as it does a risky approval.
 * - `msg-send` writes only to an existing conversation; `to` names only its
 *   members, which the host checks itself.
 * - `msg-watch` asks for a `msg-changed` push when a source changes.
 */
export type GatewayMessagingClientMessage =
  | {
      readonly type: "msg-read";
      readonly id: string;
      readonly what: (typeof gatewayMessagingLists)[number];
      readonly cursor?: string;
    }
  | {
      readonly type: "msg-read";
      readonly id: string;
      readonly what: "messages";
      readonly conversation: MessagingId;
      readonly before?: string;
    }
  | { readonly type: "msg-search"; readonly id: string; readonly text: string }
  | {
      readonly type: "msg-answer";
      readonly id: string;
      readonly item: MessagingId;
      readonly answer: GatewayInboxAnswer;
      readonly confirmed: true;
    }
  | {
      readonly type: "msg-send";
      readonly id: string;
      readonly conversation: MessagingId;
      readonly body: string;
      readonly to?: readonly MessagingId[];
    }
  | { readonly type: "msg-watch"; readonly id: string }
  | { readonly type: "msg-unwatch"; readonly id: string }
  | {
      readonly type: "team-read";
      readonly id: string;
      readonly what: (typeof gatewayTeamLists)[number];
      /** Only with `spend`. */
      readonly range?: SpendRange;
    }
  | {
      readonly type: "team-read";
      readonly id: string;
      readonly what: "pull-request";
      readonly pullRequest: MessagingId;
    };

/**
 * What the host sends in version 4 besides the version 3 messages. Every
 * answer fits one message: a list that doesn't is cut into pages, and the
 * page carries `more` when items are left.
 */
export type GatewayMessagingHostMessage =
  | {
      readonly type: "msg-data";
      readonly replyTo: string;
      readonly what: (typeof gatewayMessagingLists)[number] | "messages" | "hits";
      /** Port values (`MessagingSource`, `Conversation`, `Message`, `SearchHit`, …), as the port returned them. */
      readonly items: readonly unknown[];
      readonly more?: string;
    }
  | {
      readonly type: "msg-result";
      readonly replyTo: string;
      readonly result: AnswerResult | SendResult;
    }
  | { readonly type: "msg-changed"; readonly source: MessagingId }
  | {
      readonly type: "team-data";
      readonly replyTo: string;
      readonly what: (typeof gatewayTeamLists)[number] | "pull-request";
      /** `TeamStatus` values, as the port returned them. */
      readonly items: readonly unknown[];
      readonly more?: string;
    };

/**
 * The refusals version 4 adds, which leave the connection open. The ports'
 * refusals map one to one onto `offline`, `signed-out`, `not-found` and
 * `not-supported`. The other two are the host's own: `not-allowed-from-phone`
 * for what the phone may never do, and `rate-limited` for a search or a send
 * over the paired phone's rate (Julian, HAL-17540), which the phone may try
 * again later (UX rows G2-12 and G2-13 on HAL-17997).
 */
export const gatewayMessagingRefusalCodes = [
  "not-allowed-from-phone",
  "offline",
  "signed-out",
  "not-found",
  "not-supported",
  "rate-limited",
] as const;

/**
 * What a paired phone may ask of the desktop's agent ports, and nothing more
 * (architecture note section 2.3 on HAL-17511). The host builds one from its
 * hub and the gateway reads only this, so the allow-list is a type, not a
 * filter: a member the ports gain later stays off until it has its own "safe
 * from the phone" decision.
 *
 * Left off on purpose: starting a channel and changing its members (on the
 * phone, Members is read-only), reading attachments, `agentSpend`, and every
 * host route (connect, sign in, Settings, remote control and pairing).
 */
export interface PhoneMessaging
  extends Pick<
    AgentMessaging,
    | "listSources"
    | "listAgents"
    | "listConversations"
    | "listMessages"
    | "listInboxItems"
    | "listWork"
    | "search"
    | "answer"
    | "send"
    | "changes"
  > {
  /** The team-status reads the phone's screens show. */
  readonly team: Pick<
    TeamStatus,
    "parts" | "spend" | "seats" | "pullRequests" | "pullRequest" | "mergeQueue" | "changes"
  >;
}
