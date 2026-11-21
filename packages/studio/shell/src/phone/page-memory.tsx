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

/** Whether an element scrolls its content: its `overflow-y` lets the content scroll. */
function scrolls(element: Element): boolean {
  const overflow = getComputedStyle(element).overflowY;
  return overflow === "auto" || overflow === "scroll";
}

/**
 * The element that scrolls a phone page: its nearest ancestor that scrolls, or `null` when none
 * does. On a phone that is the window's `main`; in a short window (`short:`) it is the whole phone
 * column, as `main` no longer scrolls there.
 */
export function scrollerOf(page: HTMLElement): HTMLElement | null {
  for (let parent = page.parentElement; parent !== null; parent = parent.parentElement) {
    if (scrolls(parent)) {
      return parent;
    }
  }
  return null;
}

/**
 * Keeps how far the page is scrolled in its memory while it shows, and puts it back when the page
 * shows again, as after Back. The scroller is whichever element scrolls the page (`scrollerOf`). A
 * page shown for the first time starts at its top, as a desktop tab's fresh page does; a view that
 * scrolls to a part of its page does so in an effect, which runs after this one.
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
    const scroller = page.current === null ? null : scrollerOf(page.current);
    if (scroller === null) {
      return;
    }
    scroller.scrollTop = memory.scroll ?? 0;
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
