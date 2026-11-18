import { type ReactNode, useLayoutEffect, useRef } from "react";

/** A row a page pushed another page from: its id, and where it was in its list. */
export interface KeptRow {
  readonly id: string;
  readonly index: number;
}

/**
 * What a phone page keeps while pages pushed above it are open, as the phone draws each page fresh
 * (`shell.studio-phone`). Each page in a place's stack has its own; a page opened anew starts with
 * an empty one.
 */
export interface PhonePageMemory {
  /** How far the page was scrolled, kept by {@link KeptScroll}; `undefined` until it first shows. */
  scroll: number | undefined;
  /**
   * The row the page's view pushed a page from, kept by the view, so focus can go back to it, or
   * to the row that took its place when it's gone, when the page shows again.
   */
  row: KeptRow | undefined;
}

/** A page's memory before it first shows. */
export function emptyPageMemory(): PhonePageMemory {
  return { scroll: undefined, row: undefined };
}

/**
 * Keeps how far the page is scrolled in its memory while it shows, and puts it back when the page
 * shows again, as after Back. The scroller is the window's `main`. A page shown for the first time
 * stays where the window has it, so its own view can still scroll to a part of it.
 */
export function KeptScroll({
  memory,
  children,
}: {
  readonly memory: PhonePageMemory;
  readonly children: ReactNode;
}) {
  const page = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroller = page.current?.closest("main");
    if (scroller === null || scroller === undefined) {
      return;
    }
    if (memory.scroll !== undefined) {
      scroller.scrollTop = memory.scroll;
    }
    memory.scroll = scroller.scrollTop;
    const remember = () => {
      memory.scroll = scroller.scrollTop;
    };
    scroller.addEventListener("scroll", remember);
    return () => scroller.removeEventListener("scroll", remember);
  }, [memory]);
  return (
    // `contents`, so the page lays out in `main` as it would without it.
    <div ref={page} className="contents">
      {children}
    </div>
  );
}
