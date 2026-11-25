import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { buildChatWords as words } from "../chat/build-chat-words.ts";

/**
 * A chat's layout around its box, which stays the same element from the start screen to the
 * transcript (UX checklist T14 1.12). On the start screen (flow-assistant 6) the heading, the line
 * under it and the box sit in the middle of the tab, at most the reading column wide
 * (`assistant.start-screen.centered-input`); a Build chat not about one item draws the halo behind
 * them, still, in the theme's two frame colours, and the composer brings its glow
 * (`assistant.start-screen.halo`). Once the first message is sent the wrappers give way (`contents`)
 * and the chat's own parts take the heading's place, with the box at the bottom.
 */
export function StartScreen({
  on,
  chat,
  composer,
  link,
}: {
  /** Whether the start screen shows; otherwise only the chat, its box and its link. */
  readonly on: boolean;
  /** The chat above the box: its status line, shown items and transcript. */
  readonly chat: ReactNode;
  /** The box, drawn with its glow on the start screen. */
  readonly composer: ReactNode;
  /** "customize skill" or "edit skill", under the box. */
  readonly link: ReactNode;
}) {
  // Every part keeps its place in the tree whether or not the start screen shows, so React keeps
  // the box's element (and its focus and caret) as the start screen ends.
  return (
    <div className={on ? screenClasses : "contents"}>
      <div className={on ? "relative w-full max-w-reading" : "contents"}>
        {/* About 1.6 × the box's width and 3 × its column's height, a little below the heading. */}
        {on ? <div aria-hidden="true" data-halo-spot="" className={haloClasses} /> : null}
        <div className={on ? "relative flex flex-col items-center gap-6 text-center" : "contents"}>
          {on ? (
            <div className="flex flex-col gap-2 px-4">
              <h2 className="text-display text-fg">{words.heading}</h2>
              <p className="text-body text-fg-muted">{words.startLine}</p>
            </div>
          ) : (
            chat
          )}
          <div className={on ? "w-full text-start" : "contents"}>{composer}</div>
          {link}
        </div>
      </div>
    </div>
  );
}

const screenClasses =
  "flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6";

const haloClasses =
  "pointer-events-none absolute top-3/5 left-1/2 h-[300%] w-[160%] -translate-1/2 bg-halo-spot forced-colors:hidden";

/**
 * Keeps focus in the box as the start screen gives way to the transcript (flow-assistant 6.1): the
 * box keeps its element, so this only brings focus back if Send or the chips took it.
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
