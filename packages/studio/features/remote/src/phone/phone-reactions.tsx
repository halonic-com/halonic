import { type MessageReaction, type ReactionEmoji, reactionEmoji } from "@halonicjs/ports";
import { Button, SheetFrame, useWriteClipboard } from "@halonicjs/studio-kit";
import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { phoneReactionWords as words } from "./phone-reaction-words.ts";
import { chipsOf, isMine } from "./use-phone-reactions.ts";

/** How long a finger rests on a message, without moving, before its sheet opens. */
export const LONG_PRESS_MS = 500;

/** How far a finger may drift and still be resting: more is a scroll or a text selection. */
const MOVE_SLOP_PX = 10;

/**
 * A message the person can react to (sketch section 4 on HAL-19139): a long-press with a finger
 * or a pen (about half a second, without moving) calls `onLongPress`, and the chips show under it.
 * A finger that moves and a mouse open nothing. On a touch screen the long-press takes over the
 * system's text selection on the message, which is why the sheet has "Copy text"; a mouse still
 * selects text. Android's own long-press, and a screen reader's double-tap-and-hold, arrive as a
 * context menu, which opens the sheet too.
 */
export function Reactable({
  reactions,
  end,
  onToggle,
  onLongPress,
  children,
}: {
  readonly reactions: readonly MessageReaction[];
  /** The person's own message: its chips line up at the end, under the bubble. */
  readonly end: boolean;
  readonly onToggle: (emoji: ReactionEmoji) => void;
  readonly onLongPress: () => void;
  readonly children: ReactNode;
}) {
  const press = useLongPress(onLongPress);
  return (
    <div {...press} className="pointer-coarse:select-none [-webkit-touch-callout:none]">
      {children}
      <ReactionChips reactions={reactions} end={end} onToggle={onToggle} />
    </div>
  );
}

/**
 * The chips under a message, 32 px high (sketch section 1): one per emoji used, in the set's
 * order, with its count; the person's own in `accent-soft`. A tap toggles the person's own
 * without opening the sheet.
 */
function ReactionChips({
  reactions,
  end,
  onToggle,
}: {
  readonly reactions: readonly MessageReaction[];
  readonly end: boolean;
  readonly onToggle: (emoji: ReactionEmoji) => void;
}) {
  const chips = chipsOf(reactions);
  if (chips.length === 0) return null;
  return (
    <div data-reactions className={`mt-1.5 flex flex-wrap gap-1.5 ${end ? "justify-end" : ""}`}>
      {chips.map(({ emoji, count, mine, names }) => (
        <button
          key={emoji}
          type="button"
          data-chip={emoji}
          aria-pressed={mine}
          onClick={() => onToggle(emoji)}
          className={`focus-ring inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-small ${
            mine
              ? "border-accent bg-accent-soft text-accent-text"
              : "border-border-strong bg-surface"
          }`}
        >
          <span aria-hidden="true" className="inline-flex items-center gap-1">
            {/* Flex drops the space from view; it keeps the chip's text "👍 2" when copied. */}
            <span className="text-[16px] leading-none">{emoji}</span> {count}
          </span>
          <span className="sr-only">{words.chip(emoji, names)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The kit's phone sheet for one message: the caption "React to your message" or "React to
 * Chief's message", the message itself, so it stays in sight, the six at 48 px across the full
 * width, and "Copy text". A tap on an emoji reacts and closes it; Close and Back close it.
 */
export function ReactionSheet({
  body,
  author,
  reactions,
  onToggle,
  onClose,
}: {
  readonly body: string;
  /** Whose message it is; undefined for the person's own. */
  readonly author: string | undefined;
  readonly reactions: readonly MessageReaction[];
  readonly onToggle: (emoji: ReactionEmoji) => void;
  readonly onClose: () => void;
}) {
  const writeClipboard = useWriteClipboard();
  const [copyFailed, setCopyFailed] = useState(false);
  const copy = async () => {
    // The kit's writer never rejects: it says whether the text is on the clipboard.
    if (await writeClipboard(body)) onClose();
    else setCopyFailed(true);
  };
  return (
    <SheetFrame title={words.reactTo(author)} onClose={onClose} onCancel={onClose}>
      <div className="flex flex-col gap-4 px-4 pt-4">
        <p
          data-pressed-message
          className="line-clamp-4 rounded-lg bg-surface-muted px-3 py-2 text-reading text-fg whitespace-pre-wrap wrap-break-word"
        >
          {body}
        </p>
        <div className="grid grid-cols-6 gap-1">
          {reactionEmoji.map((emoji) => {
            const mine = isMine(reactions, emoji);
            return (
              <button
                key={emoji}
                type="button"
                aria-label={words.name(emoji)}
                aria-pressed={mine}
                onClick={() => {
                  onToggle(emoji);
                  onClose();
                }}
                className={`focus-ring flex h-12 items-center justify-center rounded-full border text-[24px] leading-none ${
                  mine ? "border-accent bg-accent-soft" : "border-transparent"
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
        <Button variant="secondary" size="touch" onClick={() => void copy()}>
          {words.copyText}
        </Button>
        <p role="status" className="text-small text-fg-muted">
          {copyFailed ? words.copyFailed : ""}
        </p>
      </div>
    </SheetFrame>
  );
}

/**
 * The pointer handlers of a long-press by a finger or a pen: `LONG_PRESS_MS` at rest, or a
 * context menu.
 */
function useLongPress(onLongPress: () => void) {
  const rest = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> }>(undefined);
  // The last pointer down was a mouse's: its right click keeps the browser's own menu.
  const mouse = useRef(false);
  const latest = useRef(onLongPress);
  latest.current = onLongPress;
  const cancel = () => {
    if (rest.current !== undefined) clearTimeout(rest.current.timer);
    rest.current = undefined;
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (event: PointerEvent) => {
      cancel();
      mouse.current = event.pointerType === "mouse";
      if (mouse.current) return;
      const timer = setTimeout(() => {
        rest.current = undefined;
        latest.current();
      }, LONG_PRESS_MS);
      rest.current = { x: event.clientX, y: event.clientY, timer };
    },
    onPointerMove: (event: PointerEvent) => {
      const at = rest.current;
      if (at === undefined) return;
      if (Math.hypot(event.clientX - at.x, event.clientY - at.y) > MOVE_SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: MouseEvent) => {
      if (mouse.current) return;
      event.preventDefault();
      cancel();
      latest.current();
    },
  };
}
