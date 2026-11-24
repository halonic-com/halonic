import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { buildChatWords as words } from "../chat/build-chat-words.ts";

/**
 * A new chat in a tab (flow-assistant 6): the heading, the line under it and the box in the middle
 * of the tab, at most the reading column wide (`assistant.start-screen.centered-input`). A Build
 * chat not about one item draws the halo behind them, still, in the theme's two frame colours,
 * and the composer brings its glow (`assistant.start-screen.halo`). Once the first message is
 * sent the chat shows its transcript instead, with the box at the bottom.
 */
export function StartScreen({
  composer,
  link,
}: {
  /** The box, drawn with its glow. */
  readonly composer: ReactNode;
  /** "customize skill" or "edit skill", under the box. */
  readonly link: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6">
      <div className="relative w-full max-w-reading">
        {/* About 1.6 × the box's width and 3 × its column's height, a little below the heading. */}
        <div
          aria-hidden="true"
          data-halo-spot=""
          className="pointer-events-none absolute top-3/5 left-1/2 h-[300%] w-[160%] -translate-1/2 bg-halo-spot forced-colors:hidden"
        />
        <div className="relative flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col gap-2 px-4">
            <h2 className="text-display text-fg">{words.heading}</h2>
            <p className="text-body text-fg-muted">{words.startLine}</p>
          </div>
          <div className="w-full text-start">{composer}</div>
          {link}
        </div>
      </div>
    </div>
  );
}

/**
 * Keeps focus in the box as the start screen gives way to the transcript: the box jumps to the
 * bottom of the chat column (flow-assistant 6.1), which draws it anew.
 */
export function useFocusAfterStart(
  onStartScreen: boolean,
  box: RefObject<HTMLTextAreaElement | null>,
): void {
  const was = useRef(onStartScreen);
  useEffect(() => {
    if (was.current && !onStartScreen) box.current?.focus();
    was.current = onStartScreen;
  }, [onStartScreen, box]);
}
