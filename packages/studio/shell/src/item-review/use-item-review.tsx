import { useToastStore } from "@halonicjs/studio-kit";
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { ChangeMarkBusy } from "./change-mark.tsx";
import { decidedCount } from "./changes-decided.ts";
import type {
  ItemChangeToReview,
  ItemReview,
  ItemReviewDecision,
  ItemReviewHost,
  ItemReviewTarget,
} from "./item-review-api.ts";
import { ItemReviewBar } from "./item-review-bar.tsx";
import { itemReviewWords as words } from "./item-review-words.ts";
import { positionWithin } from "./review-position.ts";

/** An item page's item: the hub it is in and its id, as agents and workflows name theirs. */
export interface ReviewedItem {
  readonly hubId: string;
  readonly id: string;
}

/** What {@link useItemReview} needs. */
export interface ItemReviewParts<Ref extends ReviewedItem> {
  /** The app's changes to review; without it the page has no bar and no marks. */
  readonly host: ItemReviewHost<Ref> | undefined;
  readonly item: Ref;
  /** The item's name, for the toasts. */
  readonly name: string;
  /** Shows the change on the page and moves the focus to its mark, for Previous and Next. */
  readonly goTo: (change: ItemChangeToReview) => void;
  /** The page's `h1` (`tabIndex={-1}`): it takes the focus once the last change is decided. */
  readonly title?: RefObject<HTMLElement | null> | undefined;
  /** Opens the item's file, where Files offers Compare (review panel note 4). */
  readonly openFile?: ((path: string) => void) | undefined;
  readonly announce?: ((text: string, politeness?: "polite" | "assertive") => void) | undefined;
}

/** Which mark's decision is running: a change's id, or `all` for the bar's. */
export type ItemReviewBusyOn = { readonly id: string; readonly verb: ChangeMarkBusy };

/** What an item page's marks read and decide, from {@link useItemReview}. */
export interface ItemReviewMarks {
  readonly review: ItemReview;
  readonly decide: (change: ItemChangeToReview, verb: ChangeMarkBusy) => void;
  /** The change whose Accept or Reject is running. */
  readonly busy?: ItemReviewBusyOn | undefined;
  /** The file changed outside Halonic, so the decisions wait for Compare (review panel note 4). */
  readonly held: boolean;
}

/** An item page's changes to review, from {@link useItemReview}. */
export interface ItemReviewState {
  /** The item bar for the line under the header; nothing without changes to review. */
  readonly bar: ReactNode;
  /** For the page's marks; `null` without changes to review. */
  readonly marks: ItemReviewMarks | null;
  /** Called as an edit of the person's is saved: an edit inside a change accepts it (note 2). */
  readonly editing: () => void;
}

/**
 * The assistant's changes to an item, as its page's item bar and marks show and decide them (AI
 * changes 1.2 and 1.3). Each Accept or Reject, and Accept all or Reject all, is one decision with
 * a toast that has Undo; the review is read again each time the app says it changed.
 *
 * @example
 * const changes = useItemReview({ host, item: { hubId, id }, name, goTo: focusMark });
 */
export function useItemReview<Ref extends ReviewedItem>(
  parts: ItemReviewParts<Ref>,
): ItemReviewState {
  const { host, item, name, goTo, openFile } = parts;
  const { hubId, id } = item;
  const toasts = useToastStore();
  const [review, setReview] = useState<ItemReview | null>(null);
  const [position, setPosition] = useState(0);
  const [busy, setBusy] = useState<ItemReviewBusyOn>();
  const [held, setHeld] = useState(false);
  // How many changes there were as the person's edit was saved; a later read with fewer says so.
  const countBeforeEdit = useRef<number>(undefined);
  const shown = useRef(review);
  shown.current = review;
  const announce = useRef(parts.announce);
  announce.current = parts.announce;
  // The ref as given, read by `read` without making it a dependency: only hub and id count.
  const ref = useRef(item);
  ref.current = item;
  const reads = useRef(0);
  // After a decision: where among the changes the focus lands once the review is read again.
  const landAt = useRef<number>(undefined);
  const [landing, setLanding] = useState<{ readonly at: number }>();
  const landNow = useRef({ goTo, title: parts.title });
  landNow.current = { goTo, title: parts.title };

  const read = useCallback(async () => {
    if (host === undefined) return;
    const asked = ++reads.current;
    try {
      const found = await host.changesIn(ref.current);
      // Only the newest read counts: an older one may answer after it.
      if (asked !== reads.current) return;
      const count = found?.changes.length ?? 0;
      const before = countBeforeEdit.current;
      countBeforeEdit.current = undefined;
      if (before !== undefined && count < before)
        announce.current?.(words.acceptedByEdit, "polite");
      setReview(found);
      setHeld(false);
      setPosition((at) => positionWithin(at, count));
      const at = landAt.current;
      landAt.current = undefined;
      if (at !== undefined) setLanding({ at });
    } catch (error) {
      console.error(`Reading the changes to review in ${hubId}/${id}`, error);
    }
  }, [host, hubId, id]);

  useEffect(() => {
    if (host === undefined) return;
    void read();
    return host.subscribe(ref.current, () => void read());
  }, [host, read]);

  // The pressed Accept or Reject is gone with its change, so the focus goes to the change that took
  // its place, or the last one; with none left, to the page's `h1` (a11y check RV1). Focus the
  // person moved elsewhere while the decision ran stays where they put it.
  useEffect(() => {
    if (landing === undefined || !focusLost()) return;
    const changes = shown.current?.changes ?? [];
    const at = Math.min(landing.at, changes.length - 1);
    const next = changes[at];
    if (next === undefined) {
      landNow.current.title?.current?.focus();
      return;
    }
    setPosition(at);
    landNow.current.goTo(next);
  }, [landing]);

  const failed = (error: unknown) =>
    toasts?.show({
      tone: "danger",
      title: words.couldntSave(error instanceof Error ? error.message : String(error)),
    });

  const undo = async (back: () => Promise<"done" | "held">) => {
    try {
      if ((await back()) === "held") setHeld(true);
    } catch (error) {
      failed(error);
    }
  };

  const settle = (
    outcome: ItemReviewDecision,
    verb: ChangeMarkBusy,
    count: number,
    target: ItemReviewTarget,
  ) => {
    if (outcome.status === "done") {
      landAt.current =
        target.kind === "all" ? 0 : Math.max(target.review.changes.indexOf(target.change), 0);
      void read();
      toasts?.show({
        tone: "success",
        title: words.decided(verb, count, name),
        action: { label: words.undo, onClick: () => void undo(outcome.undo) },
      });
    } else if (outcome.status === "held") {
      setHeld(true);
    } else if (outcome.status === "stale") {
      // Note 1: the review was read before the file changed; show the new one quietly.
      void read();
    } else {
      toasts?.show({ tone: "info", title: words.cantSeparate });
    }
  };

  const decide = async (
    target: ItemReviewTarget,
    verb: ChangeMarkBusy,
    busyOn: ItemReviewBusyOn["id"],
  ) => {
    if (host === undefined || busy !== undefined) return;
    countBeforeEdit.current = undefined;
    setBusy({ id: busyOn, verb });
    const count = decidedCount(target, verb, review);
    try {
      settle(
        verb === "accept" ? await host.accept(target) : await host.reject(target),
        verb,
        count,
        target,
      );
    } catch (error) {
      failed(error);
    } finally {
      setBusy(undefined);
    }
  };

  if (review === null) {
    return { bar: null, marks: null, editing: () => {} };
  }
  const decideAll = (verb: ChangeMarkBusy) =>
    void decide({ kind: "all", path: review.path }, verb, "all");
  const bar = (
    <ItemReviewBar
      count={review.changes.length}
      position={position}
      onStep={(next) => {
        setPosition(next);
        const change = review.changes[next];
        if (change !== undefined) goTo(change);
      }}
      onAcceptAll={() => decideAll("accept")}
      onRejectAll={() => decideAll("reject")}
      busy={busy?.id === "all" ? busyAll(busy.verb) : undefined}
      heldOutside={held ? { onCompare: () => openFile?.(review.path) } : undefined}
    />
  );
  return {
    bar,
    marks: {
      review,
      held,
      busy,
      decide: (change, verb) => void decide({ kind: "change", review, change }, verb, change.id),
    },
    editing: () => {
      countBeforeEdit.current = shown.current?.changes.length;
    },
  };
}

/** Whether the focus fell to the page's body, as it does when the focused button is removed. */
function focusLost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}

const busyAll = (verb: ChangeMarkBusy) => (verb === "accept" ? "accept-all" : "reject-all");
