import { type ReactNode, useLayoutEffect, useRef } from "react";
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
 * @example
 * <ChatTranscript label="Chat with Sorter">
 *   <ChatMessage from="you">Sort this mail</ChatMessage>
 * </ChatTranscript>
 */
export function ChatTranscript({ label, notice, noticeId, children }: ChatTranscriptProps) {
  const scroller = useRef<HTMLElement>(null);
  const atEnd = useRef(true);

  // After every render, since a reply grows by re-rendering its steps.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element !== null && atEnd.current) {
      element.scrollTop = element.scrollHeight;
    }
  });

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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      onScroll={noteWhereTheReaderIs}
    >
      {notice === undefined ? null : (
        <div id={noticeId} className="sticky top-0 bg-surface">
          <LineFrame icon={<WarningIcon />}>{notice}</LineFrame>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-reading flex-col gap-6 px-4 py-4">{children}</div>
    </section>
  );
}
