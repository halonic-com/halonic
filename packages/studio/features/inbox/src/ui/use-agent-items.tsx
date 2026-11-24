import type { InboxItem as AgentItem, AgentMessaging, MessagingSource } from "@halonicjs/ports";
import { Button, type ListRow, StatusChip } from "@halonicjs/studio-kit";
import { type ReactNode, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { AgentInbox, type AgentInboxState } from "../agent/agent-inbox.ts";
import {
  agentItemKey,
  agentItemMeta,
  agentItemTitle,
  isAgentItemLate,
  sourceDownLine,
} from "../agent/agent-item-text.ts";
import { AgentItemCard } from "./agent-item-card.tsx";

/** What the Inbox page shows of the agents' items, next to its own. */
export interface AgentItems {
  /** How many items wait, for the Needs you count. */
  readonly waiting: number;
  /** One row per open item, after the Inbox's own rows. */
  readonly rows: (now: Date) => ListRow[];
  /** Over the list: each source that can't take answers, and a read that failed. */
  readonly lines: (now: Date) => ReactNode;
  /** The open item's row key, while one is open. */
  readonly openKey: string | undefined;
  /** Opens the item of that row key; `false` when the key isn't an agent item's. */
  readonly open: (key: string) => boolean;
  readonly close: () => void;
  /** The open item's card, or `otherwise` while none is open. */
  readonly card: (now: () => Date, otherwise: ReactNode) => ReactNode;
}

const nothing: AgentInboxState = {
  loaded: true,
  sources: [],
  items: [],
  work: [],
  error: undefined,
};

/** Couldn't read the agents' items; said over the list, with **Try again**. */
export const agentLoadFailed = "Couldn't load the items from your agents.";

/**
 * The agents' cards and questions for the Inbox page (`inbox.agent-inbox-items`), read from
 * `AgentMessaging` while the page is open. Without it, there are none.
 */
export function useAgentItems(messaging: AgentMessaging | undefined): AgentItems {
  const inbox = useMemo(
    () => (messaging === undefined ? undefined : new AgentInbox(messaging)),
    [messaging],
  );
  const subscribe = useCallback(
    (listener: () => void) => inbox?.subscribe(listener) ?? (() => {}),
    [inbox],
  );
  const state = useSyncExternalStore(subscribe, () => inbox?.state ?? nothing);
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const waiting = state.items.filter((item) => item.state.kind === "open");
  const sourceOf = (item: AgentItem) => state.sources.find((source) => source.id === item.source);
  const openItem = state.items.find((item) => item.id === openId);
  // Stable, so the page can close the card from an effect when its own item opens.
  const close = useCallback(() => setOpenId(undefined), []);

  return {
    waiting: waiting.length,
    rows: (now) => waiting.map((item) => agentRow(item, sourceOf(item), now)),
    lines: (now) => (
      <SourceLines
        sources={state.sources}
        failed={state.error !== undefined}
        retry={() => void inbox?.refresh()}
        now={now}
      />
    ),
    openKey: openItem === undefined ? undefined : agentItemKey(openItem),
    open: (key) => {
      const found = waiting.find((item) => agentItemKey(item) === key);
      setOpenId(found?.id);
      return found !== undefined;
    },
    close,
    card: (now, otherwise) =>
      openItem === undefined || inbox === undefined ? (
        otherwise
      ) : (
        <AgentItemCard
          key={openItem.id}
          item={openItem}
          source={sourceOf(openItem)}
          work={state.work.find((work) => work.id === openItem.work)}
          now={now}
          answer={(answer) => inbox.answer(openItem.id, answer)}
        />
      ),
  };
}

/** An agent item's row: its title, then its source, who asks and how long it has waited. */
function agentRow(item: AgentItem, source: MessagingSource | undefined, now: Date): ListRow {
  const row = {
    id: agentItemKey(item),
    title: agentItemTitle(item),
    meta: agentItemMeta(item, source, now),
    wrapTitle: true,
    wrapMeta: true,
  };
  return isAgentItemLate(item, now)
    ? { ...row, trailing: <StatusChip tone="attention">Late</StatusChip> }
    : row;
}

function SourceLines({
  sources,
  failed,
  retry,
  now,
}: {
  readonly sources: readonly MessagingSource[];
  readonly failed: boolean;
  readonly retry: () => void;
  readonly now: Date;
}) {
  const down = sources.flatMap((source) => {
    const line = sourceDownLine(source, now);
    return line === null ? [] : [{ id: source.id, text: `${source.label} · ${line}` }];
  });
  if (down.length === 0 && !failed) return null;
  return (
    <div className="flex flex-col gap-1 px-4 pb-2 text-small text-fg-muted">
      {down.map((line) => (
        <p key={line.id}>{line.text}</p>
      ))}
      {failed ? (
        <p className="flex flex-wrap items-center gap-2">
          {agentLoadFailed}
          <Button variant="ghost" size="sm" onClick={retry}>
            Try again
          </Button>
        </p>
      ) : null}
    </div>
  );
}
