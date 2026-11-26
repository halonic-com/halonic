import type { MessagingId } from "@halonicjs/ports";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { ExchangeView } from "./exchange-view.tsx";
import type { Exchange } from "./use-ask-box.ts";

/** The props of {@link ExchangeList}. */
export interface ExchangeListProps {
  readonly exchanges: readonly Exchange[];
  readonly onRetry: (exchange: Exchange) => void;
  readonly onOpenChat: (conversation: MessagingId) => void;
}

/**
 * The questions asked and their answers, under the box's divider: the one area that scrolls, so
 * the question row and the footer stay in the box (HAL-19213). Once the newest question has
 * scrolled above the divider, it stays pinned there on one line, outside the scrolling list, and a
 * short fade under the divider keeps a line scrolling up from looking cut (HAL-19401). At the top
 * of the list the fade lies over its padding only, so the first line shows whole.
 */
export function ExchangeList({ exchanges, onRetry, onOpenChat }: ExchangeListProps) {
  const list = useRef<HTMLOListElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);
  const measure = useCallback(() => {
    if (list.current !== null) setScrolledPast(newestQuestionAbove(list.current));
  }, []);
  useNewestInView(list, exchanges, measure);
  const pinned = scrolledPast ? exchanges.at(-1)?.question : undefined;

  return (
    <div className="relative flex min-h-0 flex-col border-t border-border">
      <ol
        ref={list}
        onScroll={measure}
        className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3"
      >
        {exchanges.map((exchange) => (
          <ExchangeView
            key={exchange.id}
            exchange={exchange}
            onRetry={onRetry}
            onOpenChat={onOpenChat}
          />
        ))}
      </ol>
      {/* Only looks: the pinned question repeats one already in the list, where it is read. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0">
        {pinned !== undefined ? (
          <p
            data-pinned-question=""
            className="truncate bg-surface-raised px-3.5 pt-2 pb-1 text-small text-fg-muted"
          >
            {pinned}
          </p>
        ) : null}
        <div data-fade="" className="h-3 bg-linear-to-b from-surface-raised to-transparent" />
      </div>
    </div>
  );
}

/**
 * Scrolls the exchanges to the newest one whenever they change: a question just sent, or its
 * answer arriving, is what the person is looking for. Then measures whether its question is out of
 * sight, since a scroll set from code may not fire a scroll event.
 */
function useNewestInView(
  list: RefObject<HTMLOListElement | null>,
  exchanges: readonly Exchange[],
  measure: () => void,
) {
  useEffect(() => {
    const element = list.current;
    if (element !== null && exchanges.length > 0) element.scrollTop = element.scrollHeight;
    measure();
  }, [list, exchanges, measure]);
}

/** Whether the newest question's top has scrolled above the list's top edge. */
function newestQuestionAbove(list: HTMLElement): boolean {
  const questions = list.querySelectorAll("[data-question]");
  const newest = questions.item(questions.length - 1);
  if (newest === null) return false;
  return newest.getBoundingClientRect().top < list.getBoundingClientRect().top;
}
