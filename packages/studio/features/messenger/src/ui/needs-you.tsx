import type { MessagingId } from "@halonicjs/ports";
import { Avatar, agentTint, Button, PlaceIcon } from "@halonicjs/studio-kit";
import { useSettleAway, useSettling } from "@halonicjs/studio-kit/settle";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { chatAgent } from "../chat-name.ts";
import { listWords } from "../list-words.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { endedCard, type NeedsYouRead, type WaitingCard } from "../needs-you.ts";
import { ChatCard } from "./chat-cards.tsx";
import { FinalCard, useSaySettled } from "./final-card.tsx";

const words = listWords.needsYou;

/**
 * What waits for the person across `rows`, with the Inbox's items as read, read again whenever the
 * rows are; undefined at first.
 */
export function useWaiting(
  messenger: Messenger,
  rows: readonly ConversationRow[] | undefined,
): NeedsYouRead | undefined {
  const [waiting, setWaiting] = useState<NeedsYouRead | undefined>(undefined);
  useEffect(() => {
    if (rows === undefined) return;
    let current = true;
    // One Inbox read serves both: the Messenger shares a read already on its way.
    Promise.all([messenger.needsYou(rows), messenger.inboxItems()]).then(
      ([read, items]) => {
        if (current) setWaiting({ waiting: read, items });
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
 * **Open chat**. Once a card ended, here or elsewhere, it shows its final state, then settles out
 * of the list (`messenger.final-state`), and the panel reads out an answer given here.
 */
export function NeedsYouPanel({
  messenger,
  read,
  onOpenChat,
  onAnswered,
}: {
  readonly messenger: Messenger;
  /** Undefined until the first read landed. */
  readonly read: NeedsYouRead | undefined;
  readonly onOpenChat: (conversation: MessagingId) => void;
  /** A card was answered: the page reads what waits again. */
  readonly onAnswered: () => void;
}) {
  const [said, setSaid] = useState({ text: "", count: 0 });
  const say = useCallback(
    (text: string) => setSaid((last) => ({ text, count: last.count + 1 })),
    [],
  );
  const panel = useRef<HTMLElement>(null);
  // The cards answered here, already read out, and whether the next read moves focus on.
  const answeredHere = useRef(new Set<MessagingId>());
  const focusOn = useRef(false);
  const answered = useCallback(
    async (card: MessagingId, option: string) => {
      answeredHere.current.add(card);
      focusOn.current = true;
      say(messengerWords.card.answered(option));
      onAnswered();
    },
    [onAnswered, say],
  );
  const waiting = read?.waiting;
  const endedOf = useCallback((left: WaitingCard) => endedCard(read?.items ?? [], left), [read]);
  const { settling, gone } = useSettling(waiting ?? [], waitingKey, endedOf);
  useSaySettled(
    settling.map((each) => each.card),
    answeredHere.current,
    say,
  );
  // The answered card turned into its final state, so its button is gone: as in a chat, the next
  // card's first option, or else the panel's title, takes focus.
  useEffect(() => {
    if (waiting === undefined || !focusOn.current) return;
    focusOn.current = false;
    const next =
      panel.current?.querySelector<HTMLElement>("[data-needs-you-card] :is(button, input)") ??
      panel.current?.querySelector<HTMLElement>("h2");
    next?.focus();
  }, [waiting]);
  const shown = [...(waiting ?? []), ...settling].sort((a, b) =>
    a.card.createdAt.localeCompare(b.card.createdAt),
  );
  const settlingIds = new Set(settling.map(waitingKey));
  return (
    <section ref={panel} aria-label={words.title} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-surface-muted text-fg-muted *:size-4"
        >
          <PlaceIcon name="inbox" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 tabIndex={-1} className="truncate text-body-strong">
            {words.title}
          </h2>
          {/* "0 waiting" would only repeat the empty state below, or show before the read lands. */}
          {(waiting?.length ?? 0) === 0 ? null : (
            <p className="text-small text-fg-muted">{words.count(waiting?.length ?? 0)}</p>
          )}
        </div>
      </header>
      <p role="status" className="sr-only">
        <span key={said.count}>{said.text}</span>
      </p>
      {waiting?.length === 0 && settling.length === 0 ? (
        <p className="m-auto text-small text-fg-muted">{words.none}</p>
      ) : (
        // Margins, not a gap, so a card settling out closes the space above it (`kit.settle`).
        <ol className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 [&>li+li]:mt-3">
          {shown.map((each) =>
            settlingIds.has(each.card.id) ? (
              <SettlingItem
                key={each.card.id}
                waiting={each}
                onOpenChat={onOpenChat}
                onGone={() => {
                  answeredHere.current.delete(each.card.id);
                  gone(each.card.id);
                }}
              />
            ) : (
              <WaitingItem
                key={each.card.id}
                messenger={messenger}
                waiting={each}
                onOpenChat={onOpenChat}
                onAnswered={(option) => answered(each.card.id, option)}
              />
            ),
          )}
        </ol>
      )}
    </section>
  );
}

const waitingKey = (waiting: WaitingCard): MessagingId => waiting.card.id;

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
  return (
    <li data-needs-you-card={waiting.card.id} className={itemClasses}>
      <AskedBy waiting={waiting} onOpenChat={onOpenChat} />
      <ChatCard
        quickActions={messenger.quickActions}
        row={waiting.row}
        card={waiting.card}
        now={messenger.now()}
        onAnswered={onAnswered}
      />
    </li>
  );
}

/** A card that left the list as it ended: its final state for the kit's hold, then it settles out. */
function SettlingItem({
  waiting,
  onOpenChat,
  onGone,
}: {
  readonly waiting: WaitingCard;
  readonly onOpenChat: (conversation: MessagingId) => void;
  readonly onGone: () => void;
}) {
  const item = useRef<HTMLLIElement>(null);
  useSettleAway(item, onGone);
  return (
    <li ref={item} data-needs-you-settling={waiting.card.id} className={itemClasses}>
      <AskedBy waiting={waiting} onOpenChat={onOpenChat} />
      <FinalCard card={waiting.card} />
    </li>
  );
}

const itemClasses = "mx-auto flex w-full max-w-3xl flex-col gap-2";

/** Who asked and where, with **Open chat**. */
function AskedBy({
  waiting,
  onOpenChat,
}: {
  readonly waiting: WaitingCard;
  readonly onOpenChat: (conversation: MessagingId) => void;
}): ReactNode {
  const { row, agent, agentId } = waiting;
  // Where by name alone: "Liam · in Liam", not the full "Liam · CTO" of the list row.
  const where = chatAgent(row)?.name ?? row.conversation.title;
  return (
    <div className="flex items-center gap-2 text-small text-fg-muted">
      {/* The asker's tint, also in a channel, as on their messages there (Sofia, HAL-19777). */}
      <Avatar name={agent} tint={agentTint(agentId)} />
      <span className="min-w-0 flex-1 truncate">
        <bdi className="font-semibold text-fg">{agent}</bdi> · <bdi>{words.where(where)}</bdi>
      </span>
      <Button size="sm" variant="ghost" onClick={() => onOpenChat(row.conversation.id)}>
        {words.openChat}
        <span className="sr-only"> {where}</span>
      </Button>
    </div>
  );
}
