import type {
  MessageReaction,
  MessageReactions,
  MessagingId,
  ReactionEmoji,
  ReactionsByMessage,
} from "@halonicjs/ports";
import { useToastStore } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationRow } from "../messenger.ts";
import { reactionWords } from "../reaction-words.ts";
import { isMine, toggled, undone } from "../reactions.ts";

/** A chat's reactions as its transcript shows them (`messenger.reactions`). */
export interface ReactionsView {
  /** Each message's reactions; a message without any isn't listed. */
  readonly byMessage: ReactionsByMessage;
  /** The person may add and take off their own: the source keeps reactions and is online. */
  readonly canReact: boolean;
  /** Adds the person's own `emoji` to `message`, or takes it off when it's there. */
  readonly toggle: (message: MessagingId, emoji: ReactionEmoji) => void;
}

const none: ReactionsByMessage = {};

/**
 * The open chat's reactions, read again with its messages on each change, for every message the
 * chat holds, old ones included. Undefined where nothing keeps reactions: no host serves them, or
 * the source says `not-supported`; the chat shows without them then. A read that fails keeps the
 * reactions it had and never fails the chat. A toggle shows at once; if saving it fails, it goes
 * back and a toast says so.
 */
export function useReactions(
  reactions: MessageReactions | undefined,
  row: ConversationRow,
  changed: number,
  now: () => Date,
): ReactionsView | undefined {
  const conversation = row.conversation.id;
  const [byMessage, setByMessage] = useState<ReactionsByMessage>(none);
  const [kept, setKept] = useState(reactions !== undefined);
  const toasts = useToastStore();
  // Counts the reads and toggles, so an answer older than the newest change never shows.
  const changes = useRef(0);
  // What the chips show now, so a toggle knows whether the person's own is there.
  const latest = useRef(byMessage);
  latest.current = byMessage;

  useEffect(() => {
    if (reactions === undefined) return;
    changes.current += 1;
    const thisRead = changes.current;
    reactions
      .list(conversation)
      .then((read) => {
        if (thisRead !== changes.current) return;
        if (read.outcome === "read") setByMessage(read.reactions);
        else if (read.reason === "not-supported") setKept(false);
      })
      .catch(reportRead);
  }, [reactions, conversation, changed]);

  const toggle = useCallback(
    (message: MessagingId, emoji: ReactionEmoji) => {
      if (reactions === undefined) return;
      changes.current += 1;
      const thisChange = changes.current;
      const before = latest.current[message] ?? [];
      const on = !isMine(before, emoji);
      const shown = toggled(before, emoji, on, now().toISOString());
      // A second press before the next render sees the first.
      latest.current = withMessage(latest.current, message, shown);
      setByMessage((all) => withMessage(all, message, shown));
      // Only this emoji goes back: a later toggle of another may have saved meanwhile.
      const undo = () => {
        setByMessage((all) => withMessage(all, message, undone(all[message] ?? [], before, emoji)));
        toasts?.show({ tone: "danger", title: reactionWords.notSaved });
      };
      reactions
        .react(message, emoji, on)
        .then((result) => {
          if (result.outcome === "refused") return undo();
          if (thisChange === changes.current) {
            setByMessage((all) => withMessage(all, message, result.reactions));
          }
        })
        .catch((error: unknown) => {
          console.error("The reaction couldn't be saved:", error);
          undo();
        });
    },
    [reactions, now, toasts],
  );

  if (reactions === undefined || !kept) return undefined;
  return { byMessage, canReact: row.source?.state.kind === "online", toggle };
}

/** `all` with `message`'s reactions replaced; a message left with none drops out. */
function withMessage(
  all: ReactionsByMessage,
  message: MessagingId,
  reactions: readonly MessageReaction[],
): ReactionsByMessage {
  const { [message]: _gone, ...rest } = all;
  return reactions.length === 0 ? rest : { ...rest, [message]: reactions };
}

/** A read that failed: the chat shows the reactions it had, and the console keeps the error. */
function reportRead(error: unknown): void {
  console.error("The chat's reactions couldn't be read:", error);
}
