import type { Conversation, MessagingId } from "@halonicjs/ports";
import { useMemo, useRef, useState } from "react";
import type { MessagingOutcome } from "./messaging-client.ts";
import { sendLine } from "./phone-messenger-words.ts";

/** What the drafts send through: the messaging client's send. */
interface DraftMessaging {
  readonly send: (
    conversation: Conversation,
    text: string,
    to: readonly MessagingId[],
  ) => Promise<MessagingOutcome<unknown>>;
}

/** A chat's box as it was left, and its send: the box starts from it and follows it. */
export interface ChatDraft {
  readonly text: string;
  /** The line under the box, such as why a message didn't go. */
  readonly line: string | undefined;
  /** A message is on its way: the box says "Sending…" and Send waits; the row shows no draft. */
  readonly sending: boolean;
  /** How many messages the computer took from this chat, so an open box empties when one does. */
  readonly sent: number;
}

/** A chat's box before anything was left in it. */
export const noDraft: ChatDraft = { text: "", line: undefined, sending: false, sent: 0 };

/** Every chat's draft while the tab is open, and the sends that change them. */
export interface ChatDrafts {
  readonly draftOf: (id: MessagingId) => ChatDraft;
  /** The row's "Draft: …" texts: none for a chat whose message is on its way. */
  readonly texts: ReadonlyMap<MessagingId, string>;
  /** Keeps what was left in a chat's box when it closed. */
  readonly keep: (id: MessagingId, text: string) => void;
  /** Sends `text` once; true when the computer took it. */
  readonly send: (
    conversation: Conversation,
    text: string,
    to: readonly MessagingId[],
  ) => Promise<boolean>;
}

/**
 * The drafts live in the list, not the box, so a send outlives its chat: a chat reopened while its
 * message is on its way shows "Sending…" and takes the outcome when it arrives, and a message the
 * computer took leaves no draft behind (HAL-19093 review).
 */
export function useChatDrafts(messaging: DraftMessaging, computer: string): ChatDrafts {
  const [drafts, setDrafts] = useState<ReadonlyMap<MessagingId, ChatDraft>>(new Map());
  // A second tap before the list redraws must not send twice.
  const inFlight = useRef(new Set<MessagingId>());
  const change = (id: MessagingId, next: (draft: ChatDraft) => ChatDraft) =>
    setDrafts((before) => new Map(before).set(id, next(before.get(id) ?? noDraft)));

  const texts = useMemo(
    () =>
      new Map(
        [...drafts].filter(([, draft]) => !draft.sending).map(([id, draft]) => [id, draft.text]),
      ),
    [drafts],
  );

  async function send(conversation: Conversation, text: string, to: readonly MessagingId[]) {
    const id = conversation.id;
    if (inFlight.current.has(id)) return false;
    inFlight.current.add(id);
    change(id, (draft) => ({ ...draft, text, line: undefined, sending: true }));
    let outcome: MessagingOutcome<unknown>;
    try {
      outcome = await messaging.send(conversation, text, to);
    } catch {
      // A port that rejects never said what became of the message: treat it as cut off.
      outcome = { kind: "cut-off" };
    } finally {
      inFlight.current.delete(id);
    }
    const sent = outcome.kind === "done";
    const line = sendLine(outcome, computer);
    change(id, (draft) =>
      sent
        ? { text: "", line, sending: false, sent: draft.sent + 1 }
        : { ...draft, line, sending: false },
    );
    return sent;
  }

  return {
    draftOf: (id) => drafts.get(id) ?? noDraft,
    texts,
    keep: (id, text) => change(id, (draft) => ({ ...draft, text })),
    send,
  };
}
