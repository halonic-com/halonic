import {
  type ItemRef,
  loadView,
  type OpenItemOptions,
  type ViewRef,
} from "@halonicjs/studio-shell";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import type { AnsweredViewProps } from "../answered-view.ts";
import type { AfterAnswer } from "../decide.ts";
import type { Inbox } from "../inbox.ts";
import type { WaitItem } from "../inbox-items.ts";

/** Props for {@link AnsweredView}. */
export interface AnsweredViewLoaderProps {
  readonly view: ViewRef;
  readonly props: AnsweredViewProps;
  /** The answered card, shown while the view loads and if it can't load. */
  readonly fallback: ReactNode;
}

/**
 * The view that claimed an answer, in the card's place. While it loads, and if it can't load,
 * the answered card stays as it is, decided bar and all: the answer is recorded either way, so
 * a view that fails to load costs the extra screen and nothing else.
 */
export function AnsweredView({ view, props, fallback }: AnsweredViewLoaderProps) {
  const [View, setView] = useState<ComponentType<AnsweredViewProps> | null>(null);
  useEffect(() => {
    let current = true;
    loadView<ComponentType<AnsweredViewProps>>(view).then(
      (loaded) => current && setView(() => loaded),
      (error: unknown) => console.error("Couldn't load the view after your answer.", error),
    );
    return () => {
      current = false;
    };
  }, [view]);
  return View === null ? fallback : <View {...props} />;
}

/** Where a wait card's `answeredViews` comes from, and what a view that claims an answer gets. */
export interface AnsweredViews {
  readonly inbox: Pick<Inbox, "answeredView">;
  readonly close: () => void;
  readonly openItem?: ((item: ItemRef, options?: OpenItemOptions) => void) | undefined;
}

/**
 * The view that claims a recorded answer, if any. A `claims` that throws is logged and claims
 * nothing, so the card keeps its decided bar.
 */
export function claimedView(
  views: AnsweredViews | undefined,
  item: WaitItem,
  event: string,
  after: AfterAnswer,
): ViewRef | undefined {
  if (views === undefined) return undefined;
  try {
    return views.inbox.answeredView(item, event, after);
  } catch (error) {
    console.error("Couldn't find the view after your answer.", error);
    return undefined;
  }
}
