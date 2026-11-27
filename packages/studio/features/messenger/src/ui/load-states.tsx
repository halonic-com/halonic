import {
  Button,
  EmptyState,
  enter,
  SKELETON_AFTER_MS,
  SkeletonBar,
  type SkeletonBarWidth,
  STILL_LOADING_AFTER_MS,
} from "@halonicjs/studio-kit";
import { type EngineWords, errorMessageFor } from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useState } from "react";
import { messengerWords } from "../messenger-words.ts";

/** Why a read failed: a kinded error's own reason, else the Inbox's "The engine isn't answering". */
export function failureReason(error: unknown, title: string, words: EngineWords): string {
  const message = errorMessageFor(error, { title });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? words.notAnswering : reason;
}

/**
 * The list's column while its first read failed, then the list itself (`messenger.load-states`):
 * "Couldn't load your chats" with **Try again** when the first read failed, and once the chats
 * showed, a later failed read keeps them under the Inbox's "showing what it said last" line. While
 * the first read is on its way the list shows {@link ChatsSkeleton} under its tabs.
 */
export function ChatsLoad({
  loaded,
  error,
  words,
  onRetry,
  children,
}: {
  readonly loaded: boolean;
  readonly error: unknown;
  readonly words: EngineWords;
  readonly onRetry: () => void;
  /** The list: its skeleton rows until the chats were read, then the rows. */
  readonly children: ReactNode;
}) {
  const failed = error !== undefined;
  if (!loaded && failed) {
    const title = messengerWords.load.chatsFailed;
    return (
      <EmptyState
        tone="error"
        align="start"
        title={title}
        description={failureReason(error, title, words)}
        action={{ label: messengerWords.load.tryAgain, onClick: onRetry }}
      />
    );
  }
  return (
    <>
      <div role="status">
        {loaded && failed ? (
          <p className="px-2 pb-2 text-small text-fg-muted">{words.showingLast}</p>
        ) : null}
      </div>
      {children}
    </>
  );
}

/** The skeleton rows' bar widths, a little different in each row; fixed, so screenshots are stable. */
const skeletonWidths: readonly { name: SkeletonBarWidth; line: SkeletonBarWidth }[] = [
  { name: "2/5", line: "7/10" },
  { name: "1/2", line: "3/5" },
  { name: "1/3", line: "2/3" },
];

/** A zero-width space: it gives a bar's line the height of the real row's text there. */
const lineHeight = String.fromCharCode(0x200b);

/**
 * The chats while their first read is on its way (`messenger.load-states`, motion 7): nothing for
 * 300 ms, so a fast load doesn't flash, then three rows in the real rows' shape (80px, 10px
 * padding, a 60px picture, the 15px name and 14px preview lines; HAL-19735), so nothing moves when
 * the chats arrive. They breathe three times, then
 * rest; under reduced motion they stay still. Hidden from screen
 * readers, which hear "Loading your chats" instead. After 10 seconds "Still loading" and **Try
 * again** show under them, as under the kit's List.
 */
export function ChatsSkeleton({ onRetry }: { readonly onRetry: () => void }) {
  const wait = useWait();
  const status = { early: "", showing: messengerWords.load.chats, slow: messengerWords.load.slow }[
    wait
  ];
  return (
    <div>
      {/* There from the start, so screen readers announce the text when it arrives. */}
      <span role="status" className="sr-only">
        {status}
      </span>
      <div aria-busy="true">
        {wait === "early" ? null : (
          <ul ref={breathe} aria-hidden="true" className="flex flex-col gap-1">
            {skeletonWidths.map((widths) => (
              <li key={widths.name} className="flex h-20 items-center gap-3 px-3 py-2.5">
                <SkeletonBar kind="sidebar" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center text-reading">
                    {lineHeight}
                    <SkeletonBar kind="title" width={widths.name} />
                  </span>
                  <span className="flex items-center text-body">
                    {lineHeight}
                    <SkeletonBar kind="meta" width={widths.line} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {wait === "slow" ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <span aria-hidden="true" className="text-small text-fg-muted">
              {messengerWords.load.slow}
            </span>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {messengerWords.load.tryAgain}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** One breath of the skeleton rows (motion 7): three of them take 4.8 s, under the 5 s rule. */
const BREATH_MS = 1600;

/**
 * The skeleton rows breathe, opacity 1 → 0.55 → 1, three times, then rest (motion 7 of the design
 * review). Nothing moves for longer than 5 seconds without a control, and under reduced motion
 * nothing breathes. jsdom has no `element.animate`, so there they stay still too.
 */
function breathe(element: HTMLElement | null): void {
  if (element === null || typeof element.animate !== "function") return;
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true) return;
  element
    .animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], {
      duration: BREATH_MS,
      easing: "ease-in-out",
      iterations: 3,
    })
    .finished.catch(reportMotion);
}

/** Where a wait is, counted from the first render: too early to show anything, showing, or long. */
function useWait(): "early" | "showing" | "slow" {
  const [wait, setWait] = useState<"early" | "showing" | "slow">("early");
  useEffect(() => {
    const show = setTimeout(() => setWait("showing"), SKELETON_AFTER_MS);
    const slow = setTimeout(() => setWait("slow"), STILL_LOADING_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(slow);
    };
  }, []);
  return wait;
}

/**
 * Fades `ref`'s element in each time `key` changes to something shown: an opened chat, or the
 * chats once loaded (motions 1 and 7 of the design review). It doesn't move: the panel didn't.
 */
export function useFadeIn(ref: RefObject<HTMLElement | null>, key: unknown): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (key === undefined || key === false || element === null) return;
    enter(element, { move: "none" }).catch(reportMotion);
  }, [ref, key]);
}

/** A motion that failed for another reason than being replaced; the change itself still shows. */
export function reportMotion(error: unknown): void {
  // A motion cancelled because its element went or another took over did nothing wrong.
  if (error instanceof DOMException && error.name === "AbortError") return;
  console.error("A Messenger motion failed:", error);
}
