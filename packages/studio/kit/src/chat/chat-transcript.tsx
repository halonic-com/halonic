import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { WarningIcon } from "../icons/warning-icon.tsx";
import { LineFrame } from "../line-frame/line-frame.tsx";

/** The props of `ChatTranscript`. */
export interface ChatTranscriptProps {
  /** The region's name: "Chat with Sorter". */
  readonly label: string;
  /**
   * A line at the top that stays while it's true, with the warning mark: "The engine isn't
   * answering. Showing what it said last." The messages under it stay.
   */
  readonly notice?: string | undefined;
  /**
   * The notice's `id`, so a control that waits because of it can name it as its reason: the
   * composer's Send while the engine isn't answering.
   */
  readonly noticeId?: string | undefined;
  /** The `ChatMessage` rows, oldest first. */
  readonly children: ReactNode;
}

/** Within this many pixels of the end, the reader counts as at the end and stays there. */
const AT_END_SLACK_PX = 24;

/**
 * The scrolling transcript of a chat: its messages in a reading-width column, newest at the
 * bottom. While the reader is at the end, it stays at the end as a reply grows; once they scroll
 * up to read, it leaves the scroll where they put it.
 *
 * It's a named region, not a live region: nothing is read while a reply streams in. The feature
 * announces the end of a reply through the shell's announcer.
 *
 * It's one Tab stop with the inset focus ring, so a keyboard user can scroll back with the arrow
 * keys even when no message holds a button. Chromium makes a scroller focusable by itself, but
 * WebKit, which the desktop app runs in on macOS and Linux, doesn't. The ring is inset because
 * the pane around the transcript would clip an outer one.
 *
 * @example
 * <ChatTranscript label="Chat with Sorter">
 *   <ChatMessage from="you">Sort this mail</ChatMessage>
 * </ChatTranscript>
 */
export function ChatTranscript({ label, notice, noticeId, children }: ChatTranscriptProps) {
  const scroller = useRef<HTMLElement>(null);
  const noticeLine = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);

  // After every render, since a reply grows by re-rendering its steps.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element !== null && atEnd.current) {
      element.scrollTop = element.scrollHeight;
    }
  });

  // The sticky notice covers the top of the scroller, so a button the browser scrolls into view
  // when it takes focus would land under it. Padding the scroll by the notice's height keeps it
  // clear. The notice wraps on a narrow window, so its height is measured again when it changes.
  useEffect(() => {
    const element = scroller.current;
    const line = noticeLine.current;
    if (element === null || line === null) {
      return;
    }
    const padByTheNotice = () => {
      element.style.scrollPaddingTop = `${line.offsetHeight}px`;
    };
    padByTheNotice();
    if (typeof ResizeObserver === "undefined") {
      return () => element.style.removeProperty("scroll-padding-top");
    }
    const observer = new ResizeObserver(padByTheNotice);
    observer.observe(line);
    return () => {
      observer.disconnect();
      element.style.removeProperty("scroll-padding-top");
    };
  }, [notice === undefined]);

  function noteWhereTheReaderIs() {
    const element = scroller.current;
    if (element === null) {
      return;
    }
    const below = element.scrollHeight - element.scrollTop - element.clientHeight;
    atEnd.current = below <= AT_END_SLACK_PX;
  }

  return (
    <section
      ref={scroller}
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller must be a Tab stop to scroll by keyboard in WebKit.
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto focus-ring-inset"
      onScroll={noteWhereTheReaderIs}
    >
      {notice === undefined ? null : (
        <div ref={noticeLine} id={noticeId} className="sticky top-0 bg-surface">
          <LineFrame icon={<WarningIcon />}>{notice}</LineFrame>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-reading flex-col gap-6 px-4 py-4">{children}</div>
    </section>
  );
}
