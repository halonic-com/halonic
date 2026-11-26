/**
 * The phone's Inbox and Messenger client over message version 4 of the remote
 * gateway (phase 2 G3c, architecture note on HAL-17511, sections 2.2 and 2.3).
 * It rides the {@link GatewayClient}'s open session: each request goes out
 * once and is settled by the host's answer, the host's or the shell's
 * refusal, or a drop. Nothing is queued or sent again, so a write cut off by
 * a drop stays cut off; only the watch is asked for again on the next session.
 * While the computer speaks version 3 it sends nothing at all.
 */

import type {
  AnswerResult,
  Conversation,
  GatewayClientMessage,
  GatewayHostMessage,
  GatewayInboxAnswer,
  gatewayMessagingLists,
  gatewayTeamLists,
  MessagingId,
  SendResult,
  SpendRange,
} from "@halonicjs/ports";
import {
  gatewayMaxAddressees,
  gatewayMaxPromptLength,
  gatewayMaxSearchLength,
  gatewayMessagingIdPattern,
} from "@halonicjs/ports";
import type {
  MessagingAnswer,
  MessagingSettled,
  OpenSession,
  PendingMessaging,
} from "./open-session.ts";
import type { RemoteNotSentReason, RemoteRefusal } from "./remote-view.ts";

/** A list the phone reads whole, a page at a time. */
export type MessagingList = (typeof gatewayMessagingLists)[number];

/** A team status list a `team-read` names, besides one pull request. */
export type TeamList = (typeof gatewayTeamLists)[number];

/** One page of a list, a conversation's messages or search hits. */
export interface MessagingPage {
  /** Port values (`Conversation`, `Message`, `SearchHit`, …) as the host's port returned them. */
  readonly items: readonly unknown[];
  /** The cursor that reads the next page; `undefined` on the last one. */
  readonly more: string | undefined;
}

/** What became of one Inbox or Messenger request. None is ever sent twice. */
export type MessagingOutcome<Value> =
  /** The host answered it. */
  | { readonly kind: "done"; readonly value: Value }
  /** The host refused it and kept the connection. */
  | { readonly kind: "refused"; readonly code: RemoteRefusal }
  /** It never left the phone: `off` while the computer speaks version 3, `invalid` for what the protocol doesn't allow. */
  | { readonly kind: "not-sent"; readonly reason: RemoteNotSentReason }
  /** It was sent, but the connection dropped before the host answered. */
  | { readonly kind: "cut-off" };

/** The open session to speak version 4 in; `older` while the computer speaks version 3. */
export type MessagingSession = () => OpenSession | "older" | undefined;

/** The phone's Inbox, Messenger and team status requests, for the screens to come. */
export class MessagingClient {
  private readonly session: MessagingSession;
  private onChanged: ((source: MessagingId) => void) | undefined;
  /** The session the newest `msg-watch` went out in, until it is refused, dropped or unwatched. */
  private watchedIn: OpenSession | undefined;

  constructor(session: MessagingSession) {
    this.session = session;
  }

  /** Reads one page of `what`; `cursor` is the `more` of the page before. */
  readList(what: MessagingList, cursor?: string): Promise<MessagingOutcome<MessagingPage>> {
    return this.request(
      (id) =>
        cursor === undefined
          ? { type: "msg-read", id, what }
          : { type: "msg-read", id, what, cursor },
      pageOf(what),
    );
  }

  /** Reads one page of a conversation's messages, newest first; `before` is the `more` of the page before. */
  readMessages(
    conversation: MessagingId,
    before?: string,
  ): Promise<MessagingOutcome<MessagingPage>> {
    return this.request(
      (id) =>
        before === undefined
          ? { type: "msg-read", id, what: "messages", conversation }
          : { type: "msg-read", id, what: "messages", conversation, before },
      pageOf("messages"),
    );
  }

  /** Searches every source; `text` is not blank and at most 200 code units. */
  search(text: string): Promise<MessagingOutcome<MessagingPage>> {
    if (text.trim() === "" || text.length > gatewayMaxSearchLength) return notSent("invalid");
    return this.request((id) => ({ type: "msg-search", id, text }), pageOf("hits"));
  }

  /**
   * Answers an inbox item. The message says `confirmed: true`, and the shell
   * lets it out only after its owner check passed for it (`not-confirmed`
   * otherwise); the host never takes that as proof.
   */
  answer(item: MessagingId, answer: GatewayInboxAnswer): Promise<MessagingOutcome<AnswerResult>> {
    const text = answer.kind === "reply" ? answer.text : (answer.note ?? "");
    if (text.length > gatewayMaxPromptLength || (answer.kind === "reply" && text.trim() === "")) {
      return notSent("invalid");
    }
    return this.request(
      (id) => ({ type: "msg-answer", id, item, answer, confirmed: true }),
      (message) =>
        message.type === "msg-result" && message.result.outcome !== "sent"
          ? message.result
          : undefined,
    );
  }

  /**
   * Writes to an existing conversation: `body` is not blank and at most
   * 10,000 code units, and `to` names only the conversation's members.
   */
  send(
    conversation: Conversation,
    body: string,
    to: readonly MessagingId[] = [],
  ): Promise<MessagingOutcome<SendResult>> {
    const members = conversation.members ?? [conversation.agent];
    const toMembers =
      to.length <= gatewayMaxAddressees && to.every((agent) => members.includes(agent));
    if (body.trim() === "" || body.length > gatewayMaxPromptLength || !toMembers) {
      return notSent("invalid");
    }
    const base = { type: "msg-send", conversation: conversation.id, body } as const;
    return this.request(
      (id) => (to.length > 0 ? { ...base, id, to } : { ...base, id }),
      (message) =>
        message.type === "msg-result" &&
        message.result.outcome !== "answered" &&
        message.result.outcome !== "already-answered" &&
        message.result.outcome !== "closed"
          ? message.result
          : undefined,
    );
  }

  /** Reads a team status list whole: the parts, seats, pull requests or the merge queue. */
  readTeam(what: Exclude<TeamList, "spend">): Promise<MessagingOutcome<MessagingPage>> {
    return this.request((id) => ({ type: "team-read", id, what }), teamPageOf(what));
  }

  /** Reads each source's spend for `range`. */
  readSpend(range: SpendRange): Promise<MessagingOutcome<MessagingPage>> {
    return this.request(
      (id) => ({ type: "team-read", id, what: "spend", range }),
      teamPageOf("spend"),
    );
  }

  /**
   * Reads one pull request's detail, a `PullRequestDetail`; the host refuses
   * one it can't find with `not-found`. An id outside the protocol's messaging id rule
   * isn't sent, since the host would close the session on it.
   */
  readPullRequest(pullRequest: MessagingId): Promise<MessagingOutcome<unknown>> {
    if (!gatewayMessagingIdPattern.test(pullRequest)) return notSent("invalid");
    const page = teamPageOf("pull-request");
    return this.request(
      (id) => ({ type: "team-read", id, what: "pull-request", pullRequest }),
      (message) => {
        const items = page(message)?.items;
        return items?.length === 1 ? items[0] : undefined;
      },
    );
  }

  /**
   * Calls `onChanged` with each source the host says changed, on this session
   * and every later version 4 one, until the returned function is called.
   * One watch at a time: a new one replaces the one before.
   */
  watch(onChanged: (source: MessagingId) => void): () => void {
    this.onChanged = onChanged;
    this.sendWatch();
    return () => {
      if (this.onChanged !== onChanged) return;
      this.onChanged = undefined;
      this.sendUnwatch();
    };
  }

  /** A version 4 `welcome` arrived: a watch is asked for again in the new session. */
  welcomed(): void {
    if (this.onChanged !== undefined) this.sendWatch();
  }

  /** Acts on a `msg-data`, `msg-result`, `msg-changed` or `team-data`; `false` when it fits nothing the phone asked. */
  received(message: Extract<GatewayHostMessage, { type: `msg-${string}` | "team-data" }>): boolean {
    const session = this.session();
    if (session === undefined || session === "older") return false;
    if (message.type === "msg-changed") {
      if (this.watchedIn !== session) return false;
      this.onChanged?.(message.source);
      return true;
    }
    // Anything else that waits stays waiting, so the drop that follows settles it.
    const pending = session.waiting(message.replyTo);
    if (pending?.kind !== "messaging") return false;
    session.take(message.replyTo);
    return this.answered(pending, message);
  }

  /**
   * Settles `pending`, which no longer waits, with the host's answer or
   * refusal. An answer that doesn't fit it settles it as cut off, since the
   * session ends on it, and gives `false`.
   */
  answered(
    pending: PendingMessaging,
    answer: MessagingAnswer | { readonly kind: "refused"; readonly code: RemoteRefusal },
  ): boolean {
    if ("kind" in answer) pending.settle(answer);
    else if (pending.answers(answer)) pending.settle({ kind: "answered" });
    else {
      pending.settle({ kind: "cut-off" });
      return false;
    }
    return true;
  }

  private request<Value>(
    build: (id: string) => GatewayClientMessage,
    takeValue: (message: MessagingAnswer) => Value | undefined,
  ): Promise<MessagingOutcome<Value>> {
    const session = this.session();
    if (session === "older") return notSent("off");
    if (session === undefined) return notSent("not-open");
    return new Promise((resolve) => {
      let value: Value | undefined;
      const answers = (message: MessagingAnswer) => {
        value = takeValue(message);
        return value !== undefined;
      };
      const settle = (settled: MessagingSettled) => {
        if (settled.kind !== "answered") resolve(settled);
        else if (value !== undefined) resolve({ kind: "done", value });
      };
      session.send({ kind: "messaging", answers, settle }, build);
    });
  }

  private sendWatch(): void {
    const session = this.session();
    // One watch per session: the host keeps it until `msg-unwatch` or the session ends.
    if (session === undefined || session === "older" || this.watchedIn === session) return;
    this.watchedIn = session;
    const settle = (settled: MessagingSettled) => {
      if (settled.kind !== "answered" && this.watchedIn === session) this.watchedIn = undefined;
    };
    session.send(
      { kind: "messaging", answers: (message) => message.type === "ok", settle },
      (id) => ({ type: "msg-watch", id }),
    );
  }

  /** Changes the host pushed before it read `msg-unwatch` still fit, until its `ok`. */
  private sendUnwatch(): void {
    const session = this.session();
    if (session === undefined || session === "older" || this.watchedIn !== session) {
      this.watchedIn = undefined;
      return;
    }
    // A watch asked for while this waited goes out once the host has stopped the old one.
    const settle = () => {
      if (this.watchedIn === session) this.watchedIn = undefined;
      if (this.onChanged !== undefined) this.sendWatch();
    };
    session.send(
      { kind: "messaging", answers: (message) => message.type === "ok", settle },
      (id) => ({ type: "msg-unwatch", id }),
    );
  }
}

/** The page a `msg-data` of `what` holds, and nothing for any other answer. */
function pageOf(what: string): (message: MessagingAnswer) => MessagingPage | undefined {
  return (message) =>
    message.type === "msg-data" && message.what === what
      ? { items: message.items, more: message.more }
      : undefined;
}

/** The page a `team-data` of `what` holds, and nothing for any other answer. */
function teamPageOf(what: string): (message: MessagingAnswer) => MessagingPage | undefined {
  return (message) =>
    message.type === "team-data" && message.what === what
      ? { items: message.items, more: message.more }
      : undefined;
}

function notSent<Value>(reason: RemoteNotSentReason): Promise<MessagingOutcome<Value>> {
  return Promise.resolve({ kind: "not-sent", reason });
}
