/*
 * How a decided card settles (`kit.settle`, `kit.final-state`): its final state as one line, the
 * same whether it ended here or elsewhere, held long enough to read, then the card goes.
 */
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { settleOut } from "../motion/motion.ts";
import type { StatusChipTone } from "../status-chip/status-chip.tsx";
import { decidedAt } from "../text/waiting-time.ts";

/**
 * How long a decided card shows its final state before it goes (`kit.settle`): long enough to read
 * who decided it and when.
 */
export const settleHoldMs = 4000;

/** What {@link useSettling} gives. */
export interface Settling<Item> {
  /** The items that left the open list while it showed, each as it ended, until it has gone. */
  readonly settling: readonly Item[];
  /** The item with this key has finished going: it is no longer shown. */
  readonly gone: (key: string) => void;
}

/**
 * The items that just ended while a list showed them (`kit.settle`). An item that leaves `open`
 * between two renders settles with what `endedOf` says it is now, until `gone` is called for it;
 * one `endedOf` knows nothing of is simply gone. An item that had already ended when the list
 * first showed never settles, and one that opens again stops settling.
 */
export function useSettling<Item>(
  open: readonly Item[],
  keyOf: (item: Item) => string,
  endedOf: (left: Item) => Item | undefined,
): Settling<Item> {
  const shown = useRef<ReadonlyMap<string, Item>>(new Map());
  const [settling, setSettling] = useState<ReadonlyMap<string, Item>>(new Map());

  // Before paint, so an item that ended never flashes away before it settles.
  useLayoutEffect(() => {
    const now = new Map(open.map((item) => [keyOf(item), item]));
    const left = [...shown.current].flatMap(([key, item]) => {
      if (now.has(key)) return [];
      const ended = endedOf(item);
      return ended === undefined ? [] : [[key, ended] as const];
    });
    shown.current = now;
    setSettling((current) => {
      const kept = [...current].filter(([key]) => !now.has(key));
      if (left.length === 0 && kept.length === current.size) return current;
      return new Map([...kept, ...left]);
    });
  }, [open, keyOf, endedOf]);

  const gone = useCallback((key: string) => {
    setSettling((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  return { settling: [...settling.values()], gone };
}

/**
 * Holds a settling element's final state for `hold` milliseconds, then plays `settleOut` and calls
 * `onGone` (`kit.settle`). The hold pauses while the pointer is over the element or the focus is
 * in it, so the person can read it, and goes on for what was left once they leave.
 */
export function useSettleAway(
  element: RefObject<HTMLElement | null>,
  onGone: () => void,
  hold: number = settleHoldMs,
): void {
  const goneRef = useRef(onGone);
  goneRef.current = onGone;

  useEffect(() => {
    const target = element.current;
    if (target === null) return;
    let left = hold;
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let held = 0;

    const go = () => {
      timer = undefined;
      // Nothing is left to hold, so leaving the element afterwards starts nothing again.
      left = 0;
      settleOut(target).then(
        () => goneRef.current(),
        (error: unknown) => {
          console.error("A settling card couldn't animate away:", error);
          goneRef.current();
        },
      );
    };
    const run = () => {
      startedAt = Date.now();
      timer = setTimeout(go, left);
    };
    const pause = () => {
      held += 1;
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      left = Math.max(0, left - (Date.now() - startedAt));
    };
    const resume = () => {
      held = Math.max(0, held - 1);
      if (held === 0 && timer === undefined && left > 0) run();
    };
    const pausers = ["pointerenter", "focusin"] as const;
    const resumers = ["pointerleave", "focusout"] as const;
    for (const name of pausers) target.addEventListener(name, pause);
    for (const name of resumers) target.addEventListener(name, resume);
    run();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      for (const name of pausers) target.removeEventListener(name, pause);
      for (const name of resumers) target.removeEventListener(name, resume);
    };
  }, [element, hold]);
}

/** Who ended a card, as the messaging port names them: the person, or someone with a name. */
export type CardEnder =
  | { readonly kind: "me" }
  | { readonly kind: "agent" | "person"; readonly name: string };

/**
 * A card's state once it ended, as the messaging port's `InboxItemState` gives it: answered, with
 * the option picked when it was one, or closed without an answer.
 */
export type EndedCardState =
  | {
      readonly kind: "answered";
      readonly by: CardEnder;
      readonly answer: { readonly kind: string; readonly option?: string };
      readonly answeredAt: string;
    }
  | {
      readonly kind: "closed";
      readonly reason: "cancelled" | "expired";
      readonly closedAt: string;
      readonly by?: CardEnder;
    };

/** A card's final state as one line, and the tone of the chip it shows in. */
export interface FinalState {
  readonly line: string;
  readonly tone: StatusChipTone;
}

/** The five ways a card ends, as its final-state line starts (HAL-19496). */
export const finalStateWords = {
  approved: "Approved",
  rejected: "Rejected",
  answered: "Answered",
  cancelled: "Cancelled",
  expired: "Expired",
  /** Who, after the word: "by you", "by Ada". */
  by: (name: string) => `by ${name}`,
  you: "you",
} as const;

/**
 * The option IDs that approve or reject, as every source names them (Paperclip's approvals and
 * confirmations); any other answer reads as Answered.
 */
const approving: ReadonlySet<string> = new Set(["approve", "accept"]);
const rejecting: ReadonlySet<string> = new Set(["reject"]);

/**
 * A card's final state, the same whether it ended here or elsewhere (`kit.final-state`):
 * "Approved by Ada · 14:02", "Rejected by you · 14:02", "Answered by Chief · 14:02",
 * "Cancelled · 14:02" (with "by …" when the source says who) or "Expired · 14:02".
 *
 * @example
 * finalState({ kind: "closed", reason: "expired", closedAt }).line; // "Expired · 14:02"
 */
export function finalState(state: EndedCardState): FinalState {
  if (state.kind === "closed") {
    const word = finalStateWords[state.reason];
    return { line: lineOf(word, state.by, state.closedAt), tone: "neutral" };
  }
  const option = state.answer.kind === "option" ? (state.answer.option ?? "") : "";
  if (approving.has(option)) {
    return { line: lineOf(finalStateWords.approved, state.by, state.answeredAt), tone: "success" };
  }
  if (rejecting.has(option)) {
    return { line: lineOf(finalStateWords.rejected, state.by, state.answeredAt), tone: "danger" };
  }
  return { line: lineOf(finalStateWords.answered, state.by, state.answeredAt), tone: "success" };
}

function lineOf(word: string, by: CardEnder | undefined, at: string): string {
  const time = decidedAt(new Date(at));
  if (by === undefined) return `${word} · ${time}`;
  const name = by.kind === "me" ? finalStateWords.you : by.name;
  return `${word} ${finalStateWords.by(name)} · ${time}`;
}
