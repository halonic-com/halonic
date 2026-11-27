import {
  type MessageReaction,
  type MessagingId,
  type ReactionEmoji,
  reactionEmoji,
} from "@halonicjs/ports";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessagingOutcome } from "./messaging-client.ts";
import type { PhoneMessaging } from "./phone-messenger.tsx";
import { phoneReactionWords as words } from "./phone-reaction-words.ts";

/** Each message's reactions, by its id; a message without any isn't listed. */
export type PhoneReactionsByMessage = ReadonlyMap<MessagingId, readonly MessageReaction[]>;

/** A chat's reactions on the phone, while its computer keeps them (version 5 and on). */
export interface PhoneReactions {
  readonly byMessage: PhoneReactionsByMessage;
  /** Adds the person's own `emoji` to `message`, or takes it off when it's there. */
  readonly toggle: (message: MessagingId, emoji: ReactionEmoji) => void;
  /** The last save failed: the box's line says so until the next toggle. */
  readonly failed: boolean;
}

/** One chip under a message: an emoji, who reacted with it, and whether the person did. */
export interface PhoneReactionChip {
  readonly emoji: ReactionEmoji;
  readonly count: number;
  readonly mine: boolean;
  /** Who reacted, the person first as "You". */
  readonly names: readonly string[];
}

/** Pages of reactions read at most, so a host that always says `more` can't keep the phone reading. */
const maxPages = 10;

const none: PhoneReactionsByMessage = new Map();

/**
 * The open chat's reactions (`remote.phone-reactions`), read again with its messages each time
 * `reads` counts up. Undefined while the computer keeps none: it speaks version 4 or older, or
 * its source says `not-supported`; the chat shows as before then. A read that fails keeps the
 * reactions it had. A toggle shows at once; if saving it fails, only that emoji goes back.
 */
export function usePhoneReactions(
  messaging: PhoneMessaging,
  conversation: MessagingId,
  reads: number,
): PhoneReactions | undefined {
  const [byMessage, setByMessage] = useState(none);
  const [kept, setKept] = useState(true);
  const [failed, setFailed] = useState(false);
  // Counts the reads and toggles, so an answer older than the newest change never shows.
  const changes = useRef(0);
  const latest = useRef(byMessage);
  latest.current = byMessage;

  useEffect(() => {
    // `reads` is how the chat asks for its reactions again, with its messages.
    void reads;
    changes.current += 1;
    const thisRead = changes.current;
    void readAll(messaging, conversation).then((read) => {
      if (thisRead !== changes.current) return;
      if (read.kind === "done") setByMessage(read.value);
      else if (keepsNone(read)) setKept(false);
    });
  }, [messaging, conversation, reads]);

  const toggle = useCallback(
    (message: MessagingId, emoji: ReactionEmoji) => {
      changes.current += 1;
      const thisChange = changes.current;
      const before = latest.current.get(message) ?? [];
      const on = !isMine(before, emoji);
      const shown = toggled(before, emoji, on, new Date().toISOString());
      // A second tap before the next render sees the first.
      latest.current = withMessage(latest.current, message, shown);
      setByMessage((all) => withMessage(all, message, shown));
      setFailed(false);
      // Only this emoji goes back: a later toggle of another may have saved meanwhile.
      const undo = () => {
        setByMessage((all) => withMessage(all, message, undone(all.get(message), before, emoji)));
        setFailed(true);
      };
      messaging
        .react(conversation, message, emoji, on)
        .then((result) => {
          if (result.kind !== "done") return undo();
          if (thisChange === changes.current) {
            setByMessage((all) => withMessage(all, message, result.value));
          }
        })
        // A port that rejects never said the reaction saved: the line under the box says so.
        .catch(undo);
    },
    [messaging, conversation],
  );

  if (!kept) return undefined;
  return { byMessage, toggle, failed };
}

/**
 * A message's chips, in the set's own order (👍 ❤️ 😂 😮 ✅ 👀), never by count, so they don't move
 * about; an emoji nobody used has no chip. One author counts once per emoji.
 */
export function chipsOf(reactions: readonly MessageReaction[]): readonly PhoneReactionChip[] {
  return reactionEmoji.flatMap((emoji) => {
    const names = new Set<string>();
    let mine = false;
    for (const reaction of reactions) {
      if (reaction.emoji !== emoji) continue;
      if (reaction.by.kind === "me") mine = true;
      else names.add(reaction.by.name);
    }
    const all = mine ? [words.you, ...names] : [...names];
    return all.length === 0 ? [] : [{ emoji, count: all.length, mine, names: all }];
  });
}

/** Whether the person's own `emoji` is on a message. */
export function isMine(reactions: readonly MessageReaction[], emoji: ReactionEmoji): boolean {
  return reactions.some((reaction) => reaction.emoji === emoji && reaction.by.kind === "me");
}

/** A message's reactions with the person's own `emoji` added (`on`) or taken off. */
function toggled(
  reactions: readonly MessageReaction[],
  emoji: ReactionEmoji,
  on: boolean,
  at: string,
): readonly MessageReaction[] {
  const others = reactions.filter((reaction) => !mineOf(reaction, emoji));
  return on ? [...others, { emoji, by: { kind: "me" }, at }] : others;
}

/** The reactions `now` with only the person's own `emoji` as it was `before` a failed toggle. */
function undone(
  now: readonly MessageReaction[] | undefined,
  before: readonly MessageReaction[],
  emoji: ReactionEmoji,
): readonly MessageReaction[] {
  const others = (now ?? []).filter((reaction) => !mineOf(reaction, emoji));
  return [...others, ...before.filter((reaction) => mineOf(reaction, emoji))];
}

function mineOf(reaction: MessageReaction, emoji: ReactionEmoji): boolean {
  return reaction.emoji === emoji && reaction.by.kind === "me";
}

/** `all` with `message`'s reactions replaced; a message left with none drops out. */
function withMessage(
  all: PhoneReactionsByMessage,
  message: MessagingId,
  reactions: readonly MessageReaction[],
): PhoneReactionsByMessage {
  const next = new Map(all);
  if (reactions.length === 0) next.delete(message);
  else next.set(message, reactions);
  return next;
}

/** A computer of version 4 or older, or a source without reactions: the chat shows without them. */
function keepsNone(read: MessagingOutcome<unknown>): boolean {
  return (
    (read.kind === "not-sent" && read.reason === "off") ||
    (read.kind === "refused" && read.code === "not-supported")
  );
}

/** Every page of a chat's reactions, up to `maxPages`; the first that fails says why. */
async function readAll(
  messaging: PhoneMessaging,
  conversation: MessagingId,
): Promise<MessagingOutcome<PhoneReactionsByMessage>> {
  const all = new Map<MessagingId, readonly MessageReaction[]>();
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const read = await messaging.readReactions(conversation, cursor);
    if (read.kind !== "done") return read;
    for (const item of read.value.items) all.set(item.message, item.reactions);
    cursor = read.value.more;
    if (cursor === undefined) break;
  }
  return { kind: "done", value: all };
}
