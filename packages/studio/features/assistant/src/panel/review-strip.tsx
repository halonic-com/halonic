import { Button, useToastStore } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { AssistantHost } from "../api.ts";
import { stripWords as words } from "../cards/card-words.ts";
import {
  type ChatDecision,
  decideChat,
  itemsToReviewIn,
  undoChatDecision,
} from "../cards/chat-decisions.ts";
import { cardReviewId } from "../cards/proposal-card.tsx";
import type { Announce } from "../chat/build-chats.ts";

/** The props of {@link ReviewStrip}. */
export interface ReviewStripProps {
  readonly host: AssistantHost;
  readonly chatId: string;
  /** While the chat answers, both buttons wait: the model may still be changing those items. */
  readonly answering: boolean;
  /** Where focus goes once the strip is done with: the box. */
  readonly box: RefObject<HTMLTextAreaElement | null>;
  readonly announce: Announce;
}

/**
 * "3 items to review" with **Accept all** and **Reject all** for the whole chat (flow-assistant
 * 3.5, component specs 21.4), above the box and outside the transcript's scroll. Only with two or
 * more items: with one, its card's own buttons are right there.
 */
export function ReviewStrip({ host, chatId, answering, box, announce }: ReviewStripProps) {
  const items = useItemsToReview(host, chatId);
  const strip = useRef<HTMLDivElement>(null);
  const next = useRef(0);
  const reasonId = useId();
  const decide = useDecideChat({ host, chatId, box, announce });
  if (items < 2) return null;
  const unavailable = answering ? { reason: reasonId } : undefined;
  // Each press moves focus to the next card with changes to review, on its Review (a11y 12.1).
  const goToNext = () => {
    const panel = strip.current?.parentElement;
    const reviews = [...(panel?.querySelectorAll<HTMLElement>(`[id^="${cardReviewId}"]`) ?? [])];
    if (reviews.length === 0) return;
    reviews[next.current % reviews.length]?.focus();
    next.current += 1;
  };
  return (
    <div
      ref={strip}
      className="flex items-center justify-between gap-2 border-border border-t py-1.5 pr-3 pl-4"
    >
      <div className="flex min-w-0 flex-col">
        <button
          type="button"
          aria-label={words.countName(items)}
          className="self-start rounded-sm text-small text-fg focus-ring"
          onClick={goToNext}
        >
          {words.count(items)}
        </button>
        {answering ? (
          <p id={reasonId} className="text-caption text-fg-muted">
            {words.waitForAnswer}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="secondary"
          size="sm"
          unavailable={unavailable}
          busy={decide.busy === "accept"}
          onClick={() => decide.run("accept", items)}
        >
          {words.acceptAll}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          unavailable={unavailable}
          busy={decide.busy === "reject"}
          onClick={() => decide.run("reject", items)}
        >
          {words.rejectAll}
        </Button>
      </div>
    </div>
  );
}

/** How many items have changes to review from the chat, read again whenever they may change. */
function useItemsToReview(host: AssistantHost, chatId: string): number {
  const [items, setItems] = useState(0);
  useEffect(() => {
    let reads = 0;
    let gone = false;
    const read = () => {
      reads += 1;
      const mine = reads;
      itemsToReviewIn(host, chatId).then(
        (count) => {
          if (!gone && mine === reads) setItems(count);
        },
        // The cards say what they can't read; without a count the strip only stays away.
        () => {
          if (!gone && mine === reads) setItems(0);
        },
      );
    };
    read();
    const stop = host.onDidChange((change) => {
      if (change.kind === "review" || change.kind === "chats") read();
    });
    return () => {
      gone = true;
      stop();
    };
  }, [host, chatId]);
  return items;
}

interface DecideChatProps {
  readonly host: AssistantHost;
  readonly chatId: string;
  readonly box: RefObject<HTMLTextAreaElement | null>;
  readonly announce: Announce;
}

/**
 * Accept all and Reject all: one step and one toast with **Undo**. An item waiting on Compare is
 * named in the toast, which is then a warning, never a plain success. Afterwards focus goes to
 * the box, as the strip is usually gone.
 */
function useDecideChat({ host, chatId, box, announce }: DecideChatProps) {
  const toasts = useToastStore();
  const [busy, setBusy] = useState<"accept" | "reject">();
  const undo = (decision: "accept" | "reject", done: ChatDecision) =>
    undoChatDecision(host, done).then(
      () => announce(words.undone(decision, done.changes), "polite"),
      (error: unknown) =>
        toasts?.show({ tone: "danger", title: words.cantUndo, text: reasonOf(error) }),
    );
  const run = async (decision: "accept" | "reject", items: number) => {
    if (busy !== undefined) return;
    setBusy(decision);
    try {
      const done = await decideChat(host, chatId, decision);
      box.current?.focus();
      const toast = toastOf(decision, done);
      if (toast === undefined) return;
      const action = { label: words.undo, onClick: () => void undo(decision, done) };
      toasts?.show(done.items === 0 ? toast : { ...toast, action });
    } catch (error) {
      const title = decision === "accept" ? words.cantAccept(items) : words.cantReject(items);
      toasts?.show({ tone: "danger", title, text: reasonOf(error) });
    } finally {
      setBusy(undefined);
    }
  };
  return { busy, run: (decision: "accept" | "reject", items: number) => void run(decision, items) };
}

/**
 * The toast after a decision: "Accepted 7 changes in 3 items", with what waits for Compare after
 * it as a warning. Only what waits, when nothing was decided; nothing when nothing happened.
 */
function toastOf(
  decision: "accept" | "reject",
  done: ChatDecision,
): { readonly tone: "info" | "warning"; readonly title: string } | undefined {
  const waiting = done.waiting.length === 0 ? undefined : words.waiting(done.waiting);
  if (done.items === 0)
    return waiting === undefined ? undefined : { tone: "warning", title: waiting };
  const said = (decision === "accept" ? words.accepted : words.rejected)(done.changes, done.items);
  if (waiting === undefined) return { tone: "info", title: said };
  return { tone: "warning", title: `${said}. ${waiting}` };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
