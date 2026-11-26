import type { MessagingId } from "@halonicjs/ports";
import { Avatar, Button, PlaceIcon } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useState } from "react";
import { chatTint } from "../agent-tint.ts";
import { chatAgent } from "../chat-name.ts";
import { listWords } from "../list-words.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import type { WaitingCard } from "../needs-you.ts";
import { ChatCard } from "./chat-cards.tsx";

const words = listWords.needsYou;

/** What waits for the person across `rows`, read again whenever the rows are; undefined at first. */
export function useWaiting(
  messenger: Messenger,
  rows: readonly ConversationRow[] | undefined,
): readonly WaitingCard[] | undefined {
  const [waiting, setWaiting] = useState<readonly WaitingCard[] | undefined>(undefined);
  useEffect(() => {
    if (rows === undefined) return;
    let current = true;
    messenger.needsYou(rows).then(
      (read) => {
        if (current) setWaiting(read);
      },
      (error: unknown) => console.error("The Messenger couldn't read what waits for you:", error),
    );
    return () => {
      current = false;
    };
  }, [messenger, rows]);
  return waiting;
}

/**
 * The quiet entry at the top of the Messenger's list (`messenger.needs-you`): "Needs you" with a
 * violet count of everything waiting for the person, marked current while its panel is open.
 */
export function NeedsYouEntry({
  count,
  current,
  onOpen,
}: {
  readonly count: number;
  readonly current: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-needs-you-entry
      aria-current={current ? "true" : undefined}
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-muted focus-ring aria-[current=true]:bg-surface-muted"
    >
      <span aria-hidden="true" className="grid size-8 place-items-center text-fg-muted *:size-4">
        <PlaceIcon name="inbox" />
      </span>
      <span className="min-w-0 flex-1 text-body">{words.title}</span>
      {count === 0 ? null : (
        <span className="rounded-full bg-warning-soft px-1.5 text-caption text-warning">
          {count}
          <span className="sr-only">{words.waiting(count)}</span>
        </span>
      )}
    </button>
  );
}

/**
 * The "Needs you" panel (`messenger.needs-you`): every card and question waiting across the chats,
 * oldest first, each the chat's own card, answered here as there, with who asked, where, and
 * **Open chat**. Once answered, a card leaves the list and the panel reads out the answer.
 */
export function NeedsYouPanel({
  messenger,
  waiting,
  onOpenChat,
  onAnswered,
}: {
  readonly messenger: Messenger;
  /** Undefined until the first read landed. */
  readonly waiting: readonly WaitingCard[] | undefined;
  readonly onOpenChat: (conversation: MessagingId) => void;
  /** A card was answered: the page reads what waits again. */
  readonly onAnswered: () => void;
}) {
  const [said, setSaid] = useState({ text: "", count: 0 });
  const answered = useCallback(
    async (option: string) => {
      setSaid((last) => ({ text: messengerWords.card.answered(option), count: last.count + 1 }));
      onAnswered();
    },
    [onAnswered],
  );
  return (
    <section aria-label={words.title} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-surface-muted text-fg-muted *:size-4"
        >
          <PlaceIcon name="inbox" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-body-strong">{words.title}</h2>
          {/* "0 waiting" would only repeat the empty state below, or show before the read lands. */}
          {(waiting?.length ?? 0) === 0 ? null : (
            <p className="text-small text-fg-muted">{words.count(waiting?.length ?? 0)}</p>
          )}
        </div>
      </header>
      <p role="status" className="sr-only">
        <span key={said.count}>{said.text}</span>
      </p>
      {waiting?.length === 0 ? (
        <p className="m-auto text-small text-fg-muted">{words.none}</p>
      ) : (
        <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {(waiting ?? []).map((each) => (
            <WaitingItem
              key={each.card.id}
              messenger={messenger}
              waiting={each}
              onOpenChat={onOpenChat}
              onAnswered={answered}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

/** One waiting card: who asked and where, **Open chat**, then the chat's own card. */
function WaitingItem({
  messenger,
  waiting,
  onOpenChat,
  onAnswered,
}: {
  readonly messenger: Messenger;
  readonly waiting: WaitingCard;
  readonly onOpenChat: (conversation: MessagingId) => void;
  readonly onAnswered: (option: string) => Promise<void>;
}) {
  const { card, row, agent } = waiting;
  // Where by name alone: "Liam · in Liam", not the full "Liam · CTO" of the list row.
  const where = chatAgent(row)?.name ?? row.conversation.title;
  return (
    <li data-needs-you-card={card.id} className="mx-auto flex w-full max-w-3xl flex-col gap-2">
      <div className="flex items-center gap-2 text-small text-fg-muted">
        <Avatar name={agent} tint={chatTint(row)} />
        <span className="min-w-0 flex-1 truncate">
          <bdi className="font-semibold text-fg">{agent}</bdi> · <bdi>{words.where(where)}</bdi>
        </span>
        <Button size="sm" variant="ghost" onClick={() => onOpenChat(row.conversation.id)}>
          {words.openChat}
          <span className="sr-only"> {where}</span>
        </Button>
      </div>
      <ChatCard
        quickActions={messenger.quickActions}
        row={row}
        card={card}
        now={messenger.now()}
        onFolding={() => undefined}
        onAnswered={onAnswered}
      />
    </li>
  );
}
