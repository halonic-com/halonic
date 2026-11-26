/**
 * What the phone's Agents screen and its detail sheet show of one paired
 * computer, and what they may ask of it (tunnel D7, design on HAL-15159,
 * sections 2 and 3). The screens read a {@link RemoteView} snapshot from a
 * {@link PhoneRemote} and send answers and prompts through it. The gateway
 * client behind it turns the remote gateway's messages and the connection's
 * status into the view; the screens never see a gateway message.
 *
 * Everything here lives in memory only: nothing of a view is kept on disk.
 */

import type {
  GatewayApproval,
  GatewayEventBody,
  GatewaySession,
  gatewayRefusalCodes,
} from "@halonicjs/ports";
import type { MessagingClient } from "./messaging-client.ts";
import type { PhoneStatusLabel } from "./phone-status.ts";

/**
 * Why Approve, Reject and the prompt box are off while the view is stale
 * (design decision 6 on HAL-12206). It says when they come back, not an
 * order: the phone reconnects by itself, and Try again is only in the
 * banner (C672).
 */
export const RECONNECT_TO_ANSWER = "You can answer once your phone reconnects.";

/**
 * Why they are off while this phone and the computer speak different
 * versions of the remote gateway's messages: reconnecting won't help, an
 * update will. The phone can't tell which side is older, so it names both.
 */
export const UPDATE_TO_ANSWER =
  "Update Halonic on this phone and your computer to answer from here.";

/** One event of a watched session, as the host sent it. */
export interface RemoteEvent {
  /** The session's sequence number: from 1, one more per event. */
  readonly seq: number;
  /** When it happened, by the host's clock, as the detail shows next to it. */
  readonly at: string;
  readonly body: GatewayEventBody;
}

/** One session of the computer, as the Agents list and the detail show it. */
export interface RemoteSession {
  readonly id: string;
  readonly title: string;
  /** Running, Needs you (`waiting`), Done or Failed. */
  readonly state: GatewaySession["state"];
  /** When it last changed, by the host's clock. */
  readonly updatedAt: string;
  /**
   * The events the phone holds, oldest first. Empty for a session the phone
   * doesn't watch: it watches only running and waiting ones, up to the
   * protocol's 16.
   */
  readonly events: readonly RemoteEvent[];
  /**
   * The phone dropped older events to stay within its memory cap (the last
   * 500 events or 1 MB of event text), so `events` doesn't start at the
   * beginning. The detail says so.
   */
  readonly droppedOlder: boolean;
}

/** An approval that waits for an answer: requested, and not settled since. */
export interface RemoteApproval {
  readonly sessionId: string;
  readonly approval: GatewayApproval;
  /** When it was requested, by the host's clock. */
  readonly requestedAt: string;
  /** Whether Approve and Reject are on for this one: off too while {@link sent} is set. */
  readonly canAnswer: boolean;
  /**
   * Why they are off, in words the screen shows next to them; `undefined`
   * while they are on, or off only because an answer is on its way. A stale view gives {@link RECONNECT_TO_ANSWER}; a
   * `risky` approval stays off unless the computer's switch is on and the
   * phone's owner check can ask.
   */
  readonly offReason: string | undefined;
  /**
   * The phone doesn't answer this one, connected or not: the screens show it
   * with "Answer this on your computer." and no Approve or Reject (board, on
   * HAL-16169). True for a `risky` approval unless the computer's switch "Let
   * phones answer risky approvals" is on and the phone's owner check can ask
   * (HAL-15194).
   */
  readonly answerOnComputer: boolean;
  /**
   * The answer the phone sent that the host hasn't confirmed yet. The phone
   * never sends it again: after a drop, the reconnect shows whether it
   * landed (the approval settles) or not (it is still open, unanswered).
   */
  readonly sent: "approve" | "deny" | undefined;
}

/**
 * A snapshot of one paired computer, for the screens. A new object every time
 * something changes, and the same object until then.
 */
export interface RemoteView {
  /** The header label, from the connection's status. */
  readonly label: PhoneStatusLabel;
  /**
   * The phone's own clock when the last session list or event arrived, so
   * "as of" is never in the future when the clocks disagree. `undefined`
   * before anything has arrived since the app started.
   */
  readonly asOf: Date | undefined;
  /** In the order the host listed them. */
  readonly sessions: readonly RemoteSession[];
  /** Oldest request first. */
  readonly openApprovals: readonly RemoteApproval[];
  /**
   * Whether the view is live: connected, with a session list since the last
   * reconnect. While it isn't, the screens keep showing the last sessions
   * and approvals with `asOf`, and Approve, Reject and the prompt box are off.
   */
  readonly canAnswer: boolean;
  /** Why they are off, while `canAnswer` is false; `undefined` while it is true. */
  readonly offReason: string | undefined;
  /**
   * Whether the computer said, with its last session list, that phones may
   * answer risky approvals. Only a hint for what to show: the computer checks
   * its switch again for every answer. `false` until a list says otherwise.
   */
  readonly answersRisky: boolean;
  /**
   * Whether the phone's owner check (a screen lock with a fingerprint, face or
   * PIN) could ask, checked again after the last session list. Without it the
   * phone reads the Inbox but answers nothing.
   */
  readonly ownerCheck: OwnerCheckHint;
  /**
   * Whether the computer and this phone speak different versions of the
   * gateway's messages, from the last connection that got that far. While it
   * is true, `offReason` says to update.
   */
  readonly updateNeeded: boolean;
  /**
   * Whether the computer runs an older Halonic that speaks only version 3 of
   * the gateway's messages: the phone fell back to it and offers Agents only,
   * with "Update Halonic on Tim's laptop to use Inbox and Messenger from your
   * phone." Stays true across reconnects until a version 4 `welcome`.
   */
  readonly olderComputer: boolean;
}

/**
 * What the shell last said of the phone's owner check: `unknown` from each
 * session list until the check answers, then `ready` or `unavailable`. Answers
 * that need it stay off until `ready`; only `unavailable` asks for a screen
 * lock, so a phone that has one never shows that line while the check runs.
 */
export type OwnerCheckHint = "unknown" | "ready" | "unavailable";

/** Why the host refused an answer or a prompt and kept the connection. */
export type RemoteRefusal = (typeof gatewayRefusalCodes)[number];

/**
 * Why the phone didn't send an answer or a prompt at all:
 *
 * - `off`: the view or the approval can't be answered now (its `offReason` says why);
 * - `invalid`: an empty prompt, or one longer than the protocol allows;
 * - `not-open`, `too-large`, `not-allowed`, `not-confirmed`: the shell refused to send it.
 */
export type RemoteNotSentReason =
  | "off"
  | "invalid"
  | "not-open"
  | "too-large"
  | "not-allowed"
  | "not-confirmed";

/** What became of one answer or prompt. Neither is ever sent twice. */
export type RemoteSendOutcome =
  /** The host carried it out. */
  | { readonly kind: "done" }
  /** The host refused it. */
  | { readonly kind: "refused"; readonly code: RemoteRefusal }
  /** It never left the phone. */
  | { readonly kind: "not-sent"; readonly reason: RemoteNotSentReason }
  /** It was sent, but the connection dropped before the host answered. */
  | { readonly kind: "cut-off" };

/**
 * The port between the phone's screens and the gateway client. `subscribe`
 * and `view` fit React's `useSyncExternalStore`.
 */
export interface PhoneRemote {
  /** The newest snapshot. */
  view(): RemoteView;
  /** Calls `onChange` after every new snapshot, until the returned function is called. */
  subscribe(onChange: () => void): () => void;
  /** Answers an open approval. */
  answer(
    sessionId: string,
    approvalId: string,
    decision: "approve" | "deny",
  ): Promise<RemoteSendOutcome>;
  /** Sends prompt text to a session: not empty, and at most 10,000 characters. */
  prompt(sessionId: string, text: string): Promise<RemoteSendOutcome>;
  /** The Inbox and Messenger over message version 4; absent where the screens run on a fake. */
  readonly messaging?: MessagingClient;
}
