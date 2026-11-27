/*
 * How a decided card settles (`kit.settle`, `kit.final-state`): its final state as one line, the
 * same whether it ended here or elsewhere, held long enough to read, then the card goes.
 */
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { settleOut } from "../motion/motion.ts";
import type { StatusChipTone } from "../status-chip/status-chip.tsx";
import { decidedAt } from "../text/waiting-time.ts";
import { finalStateWords } from "./final-state-words.ts";

/**
 * How long a decided card shows its final state before it goes (`kit.settle`): long enough to read
 * who decided it and when.
 */
export const settleHoldMs = 4000;

/** How a settling element goes once its hold is over; resolves when it has gone. */
export type SettleOut = (element: HTMLElement) => Promise<void>;

const SettleOutContext = createContext<SettleOut>(settleOut);

/** Props of {@link SettleMotionProvider}. */
export interface SettleMotionProviderProps {
  /** How every settling element under it goes, instead of the kit's `settleOut`. */
  readonly out: SettleOut;
  readonly children: ReactNode;
}

/**
 * Puts in how settling elements go (`kit.settle`), so a test can play and check the motion
 * without the browser's animations.
 */
export function SettleMotionProvider({ out, children }: SettleMotionProviderProps) {
  return <SettleOutContext value={out}>{children}</SettleOutContext>;
}

/** How a settling element goes where a component renders: the kit's `settleOut` by default. */
export function useSettleOut(): SettleOut {
  return useContext(SettleOutContext);
}

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
 * Holds a settling element's final state for `hold` milliseconds, then plays the settle motion
 * (`settleOut`, or what a {@link SettleMotionProvider} put in) and calls `onGone` (`kit.settle`).
 * The hold pauses while the pointer is over the element or the focus is in it, also when it
 * already is as the hold starts, and goes on for what was left once both leave.
 */
export function useSettleAway(
  element: RefObject<HTMLElement | null>,
  onGone: () => void,
  hold: number = settleHoldMs,
): void {
  const elements = useCallback(
    () => (element.current === null ? [] : [element.current]),
    [element],
  );
  useSettleAwayTogether(elements, onGone, hold);
}

/**
 * Holds several settling elements as one (`kit.settle-together`), as {@link useSettleAway} holds
 * one: cards that ended in the same read wait together, pausing while the pointer is over any of
 * them or the focus is in one, then all go at once and `onGone` is called once. `elements` is read
 * once, after the first render. With none, such as rows a filter hides, there is nothing to hold or
 * see go, so `onGone` is called at once: otherwise they would wait for good, and show again later.
 */
export function useSettleAwayTogether(
  elements: () => readonly HTMLElement[],
  onGone: () => void,
  hold: number = settleHoldMs,
): void {
  const goneRef = useRef(onGone);
  goneRef.current = onGone;
  const out = useSettleOut();

  useEffect(() => {
    const targets = elements();
    if (targets.length === 0) {
      goneRef.current();
      return;
    }
    let left = hold;
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Set once they start going, so leaving one afterwards starts nothing again.
    let done = false;
    let held = targets.reduce((sum, target) => sum + heldAtStart(target), 0);

    const go = () => {
      timer = undefined;
      done = true;
      // Nothing in them takes the focus while they go, so none is removed with the focus inside.
      for (const target of targets) target.setAttribute("inert", "");
      Promise.all(targets.map((target) => out(target))).then(
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
      if (held === 0 && timer === undefined && !done) run();
    };
    const pausers = ["pointerenter", "focusin"] as const;
    const resumers = ["pointerleave", "focusout"] as const;
    for (const target of targets) {
      for (const name of pausers) target.addEventListener(name, pause);
      for (const name of resumers) target.addEventListener(name, resume);
    }
    if (held === 0) run();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      for (const target of targets) {
        for (const name of pausers) target.removeEventListener(name, pause);
        for (const name of resumers) target.removeEventListener(name, resume);
      }
    };
  }, [elements, hold, out]);
}

/**
 * How many of the pointer and the focus are on `target` as its hold starts: a card that replaced
 * the one just answered can show right under the pointer that answered it.
 */
function heldAtStart(target: HTMLElement): number {
  const hovered = target.matches(":hover") ? 1 : 0;
  const focused = target.contains(document.activeElement) ? 1 : 0;
  return hovered + focused;
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
      readonly answer: {
        readonly kind: string;
        readonly option?: string;
        /** How the action ended, for an `action-result` answer. */
        readonly outcome?: string;
      };
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

/**
 * The option IDs that approve or reject, as every source names them (Paperclip's approvals and
 * confirmations); any other answer reads as Answered.
 */
const approving: ReadonlySet<string> = new Set(["approve", "accept"]);
const rejecting: ReadonlySet<string> = new Set(["reject"]);

/**
 * A card's final state, the same whether it ended here or elsewhere (`kit.final-state`):
 * "Approved by Ada · 14:02", "Rejected by you · 14:02", "Answered by Chief · 14:02",
 * "Cancelled · 14:02" (with "by …" when the source says who) or "Expired · 14:02". An action card
 * says how its action ended: "Succeeded", "Failed", "Declined" or "Expired", by whoever ran it.
 *
 * @example
 * finalState({ kind: "closed", reason: "expired", closedAt }).line; // "Expired · 14:02"
 */
export function finalState(state: EndedCardState): FinalState {
  if (state.kind === "closed") {
    const word = finalStateWords[state.reason];
    return { line: lineOf(word, state.by, state.closedAt), tone: "neutral" };
  }
  if (state.answer.kind === "action-result") {
    return actionLine(state.answer.outcome ?? "", state.by, state.answeredAt);
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

/** How an action ended, and its tone: only one that succeeded shows as a success. */
const actionOutcomes: Readonly<Record<string, FinalState["tone"]>> = {
  succeeded: "success",
  failed: "danger",
  declined: "neutral",
  expired: "neutral",
};

/** The line of an action card, by how the action ended: "Declined by you · 12:10". */
function actionLine(outcome: string, by: CardEnder, at: string): FinalState {
  const words: Readonly<Record<string, string>> = finalStateWords.outcomes;
  const word = words[outcome] ?? finalStateWords.answered;
  return { line: lineOf(word, by, at), tone: actionOutcomes[outcome] ?? "neutral" };
}

function lineOf(word: string, by: CardEnder | undefined, at: string): string {
  const time = decidedAt(new Date(at));
  if (by === undefined) return `${word} · ${time}`;
  const name = by.kind === "me" ? finalStateWords.you : by.name;
  return `${word} ${finalStateWords.by(name)} · ${time}`;
}
