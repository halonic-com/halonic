import { loadView, type ViewRef } from "@halonicjs/studio-shell";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import type { AnsweredViewProps } from "../answered-view.ts";

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
