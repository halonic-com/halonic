import type { InboxItem as AgentItem } from "@halonicjs/ports";
import { type ListRow, StatusChip } from "@halonicjs/studio-kit";
import {
  finalState,
  SettleMotionProvider,
  useSettleAwayTogether,
  useSettling,
} from "@halonicjs/studio-kit/settle";
import { type ReactNode, type RefObject, useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { AgentBundle } from "../agent/agent-bundles.ts";
import { agentItemTitle } from "../agent/agent-item-text.ts";
import type { InboxMotion } from "./list-motion.ts";

/**
 * What a screen reader hears when several cards end in the same read (G2 on HAL-20218): "3 cards
 * ended: Cancelled" when they ended the same way, else "3 cards ended".
 */
export function endedTogetherLine(count: number, word: string | undefined): string {
  const ended = `${count} cards ended`;
  return word === undefined ? ended : `${ended}: ${word}`;
}

/** What the Inbox's rows need to settle: where they are, how they move, and who hears it. */
export interface SettlingRowsOptions {
  /** The list's scroll area, which holds the grid of rows. */
  readonly list: RefObject<HTMLElement | null>;
  readonly motion: InboxMotion;
  /** The page's one place a screen reader hears a line; without it nothing is read out. */
  readonly announce: ((line: string) => void) | undefined;
  /**
   * The items whose open card here already said how they ended: answered from it, or its line
   * took the focus and was read out.
   */
  readonly saidHere: ReadonlySet<string>;
}

/** The agents' rows that ended while the Inbox showed them, and what holds them, then sends them away. */
export interface SettlingRows {
  /** The rows that left the open list, each with its items as they ended. */
  readonly bundles: readonly AgentBundle[];
  /** The open rows with each row that ended back where it last showed, so it settles in its place. */
  readonly inPlace: (open: readonly AgentBundle[]) => AgentBundle[];
  /** Holds each group of rows that ended together, then lets them go; render it once on the page. */
  readonly settlers: ReactNode;
}

/**
 * The agents' rows that ended while the Inbox showed them (`inbox.final-state`): a row whose items
 * were all answered, cancelled or expired, here or elsewhere, stays in its place in its final state
 * for the kit's hold, then fades, and the rows below glide up into its place. Rows that ended in
 * the same read hold and go together, and are read out as one line.
 */
export function useSettlingRows(
  open: readonly AgentBundle[],
  items: readonly AgentItem[],
  options: SettlingRowsOptions,
): SettlingRows {
  const endedOf = useCallback((left: AgentBundle) => endedBundle(left, items), [items]);
  const { settling, gone } = useSettling(open, bundleKey, endedOf);
  const groups = useGroups(settling);
  // Written while the page renders its rows, and read only by the next render: it never decides
  // what an effect does, so a render React throws away at worst puts a row back one place off.
  const shownOrder = useRef<readonly string[]>([]);
  const inPlace = (open: readonly AgentBundle[]) => {
    const rows = withEnded(open, settling, shownOrder.current);
    shownOrder.current = rows.map(bundleKey);
    return rows;
  };
  useSayEnded(groups, options);
  const { list, motion } = options;
  const settlers = (
    <SettleMotionProvider out={motion.leave}>
      {groups.map((group) => (
        <RowsSettling
          key={group.id}
          keys={group.bundles.map(bundleKey).join("\n")}
          list={list}
          onGone={() => {
            const leave = () =>
              flushSync(() => {
                for (const each of group.bundles) gone(each.key);
              });
            const body = list.current?.querySelector<HTMLElement>('[role="grid"] tbody');
            // The rows below glide up into the faded rows' place (`inbox.list-motion`).
            if (body === null || body === undefined) leave();
            else void motion.flip(body, leave);
          }}
        />
      ))}
    </SettleMotionProvider>
  );
  return { bundles: settling, inPlace, settlers };
}

/**
 * A settling row: its title muted, its line the card's final state in the kit's words, such as
 * "Approved by Ada · 14:02", and nothing to click while it goes. A bundle says how its card that
 * ended last ended.
 */
export function settledRow(row: ListRow, bundle: AgentBundle): ListRow {
  const last = lastEnded(bundle.items);
  if (last === undefined || last.state.kind === "open") return row;
  const { line, tone } = finalState(last.state);
  const { avatar, id, title } = row;
  return {
    avatar,
    id,
    title,
    meta: <StatusChip tone={tone}>{line}</StatusChip>,
    muted: true,
    inert: true,
    wrapTitle: true,
  };
}

const bundleKey = (bundle: AgentBundle) => bundle.key;

/** Puts each ended row back after the row it last showed under, or first when none is left. */
function withEnded(
  open: readonly AgentBundle[],
  ended: readonly AgentBundle[],
  shown: readonly string[],
): AgentBundle[] {
  const rows = [...open];
  for (const bundle of ended) {
    const before = shown.slice(0, Math.max(0, shown.indexOf(bundle.key))).reverse();
    const above = before.find((key) => rows.some((row) => row.key === key));
    rows.splice(rows.findIndex((row) => row.key === above) + 1, 0, bundle);
  }
  return rows;
}

/** The row with its items as they are now, once none of them waits; `undefined` while one does. */
function endedBundle(left: AgentBundle, items: readonly AgentItem[]): AgentBundle | undefined {
  const ended = left.items.flatMap((item) => {
    const found = items.find((each) => each.id === item.id);
    return found === undefined || found.state.kind === "open" ? [] : [found];
  });
  // An item that left the list altogether is simply gone, and so is a row with one that waits.
  return ended.length === left.items.length ? { ...left, items: ended } : undefined;
}

function endedAt(item: AgentItem): string {
  if (item.state.kind === "answered") return item.state.answeredAt;
  return item.state.kind === "closed" ? item.state.closedAt : item.createdAt;
}

function lastEnded(items: readonly AgentItem[]): AgentItem | undefined {
  return [...items].sort((a, b) => Date.parse(endedAt(a)) - Date.parse(endedAt(b))).at(-1);
}

/** Rows that started to settle in the same render: they ended in the same read. */
interface SettlingGroup {
  readonly id: number;
  readonly bundles: readonly AgentBundle[];
}

/** Puts each settling row in the group of the render it started settling in. */
function useGroups(settling: readonly AgentBundle[]): readonly SettlingGroup[] {
  // Written during render, which is safe here: the same rows always get the same group, so a
  // render React throws away or repeats (Strict Mode) leaves the groups as a kept render would.
  const groupOf = useRef(new Map<string, number>());
  const next = useRef(0);
  const fresh = settling.filter((bundle) => !groupOf.current.has(bundle.key));
  if (fresh.length > 0) {
    next.current += 1;
    for (const bundle of fresh) groupOf.current.set(bundle.key, next.current);
  }
  const keys = new Set(settling.map(bundleKey));
  for (const key of groupOf.current.keys()) if (!keys.has(key)) groupOf.current.delete(key);
  const groups = new Map<number, AgentBundle[]>();
  for (const bundle of settling) {
    const id = groupOf.current.get(bundle.key) ?? 0;
    groups.set(id, [...(groups.get(id) ?? []), bundle]);
  }
  return [...groups].map(([id, bundles]) => ({ id, bundles }));
}

/**
 * Reads out each group once as it starts to settle: one card's title and final state, "Merge
 * #6512: Approved by Ada · 14:02", or for several the one line of {@link endedTogetherLine}. A
 * card whose open card already said how it ended isn't read again.
 */
function useSayEnded(groups: readonly SettlingGroup[], options: SettlingRowsOptions): void {
  const said = useRef(new Set<number>());
  const { announce, saidHere } = options;
  useEffect(() => {
    for (const group of groups) {
      if (said.current.has(group.id)) continue;
      said.current.add(group.id);
      const cards = group.bundles
        .flatMap((bundle) => bundle.items)
        .filter((item) => !saidHere.has(item.id));
      const line = endedLine(cards);
      if (line !== undefined) announce?.(line);
    }
  }, [groups, announce, saidHere]);
}

function endedLine(cards: readonly AgentItem[]): string | undefined {
  const lines = cards.flatMap((card) =>
    card.state.kind === "open" ? [] : [finalState(card.state).line],
  );
  const [only] = cards;
  if (lines.length === 1 && only !== undefined) return `${agentItemTitle(only)}: ${lines[0]}`;
  if (lines.length === 0) return undefined;
  // Every way the kit says a card ended is one word before " by …" or " · ".
  const words = new Set(lines.map((line) => line.split(" ")[0]));
  const [word] = words;
  return endedTogetherLine(lines.length, words.size === 1 ? word : undefined);
}

/** Holds the rows with these keys as one (`kit.settle-together`), then says they are gone. */
function RowsSettling({
  keys,
  list,
  onGone,
}: {
  /** The rows' keys, one per line, so the hold doesn't start again on every render. */
  readonly keys: string;
  readonly list: RefObject<HTMLElement | null>;
  readonly onGone: () => void;
}) {
  const elements = useCallback(() => {
    const wanted = new Set(keys.split("\n"));
    const rows = list.current?.querySelectorAll<HTMLElement>("tr[data-row-id]") ?? [];
    return [...rows].filter((row) => wanted.has(row.getAttribute("data-row-id") ?? ""));
  }, [keys, list]);
  useSettleAwayTogether(elements, onGone);
  return null;
}
