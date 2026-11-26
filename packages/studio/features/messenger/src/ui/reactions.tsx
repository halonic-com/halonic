import { type MessageReaction, type ReactionEmoji, reactionEmoji } from "@halonicjs/ports";
import { Tooltip } from "@halonicjs/studio-kit";
import { type FocusEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { reactionWords } from "../reaction-words.ts";
import { chipsOf, isMine } from "../reactions.ts";

/** What a message needs to show its reactions and toggle the person's own. */
export interface MessageReactionsProps {
  readonly reactions: readonly MessageReaction[];
  /** The person may add and take off their own; otherwise the chips only show. */
  readonly canReact: boolean;
  readonly onToggle: (emoji: ReactionEmoji) => void;
}

/** Above this many pixels from the transcript's top, the row of six opens above its button. */
const ROOM_ABOVE_PX = 48;

/**
 * The chips under a message (`messenger.reactions`, sketch section 1): one per emoji used, in the
 * set's order, with its count; the person's own in `accent-soft`. Each is a toggle button for the
 * person's own while they may react, and its tooltip says who reacted.
 */
export function ReactionChips({ reactions, canReact, onToggle }: MessageReactionsProps) {
  const chips = chipsOf(reactions);
  if (chips.length === 0) return null;
  return (
    <div data-reactions className="flex flex-wrap gap-1">
      {chips.map(({ emoji, count, mine, names }) => {
        const look = `inline-flex h-6 items-center gap-1 rounded-full border px-2 text-small ${
          mine ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong bg-surface"
        }`;
        const content = (
          <>
            <span aria-hidden="true">
              {emoji} {count}
            </span>
            <span className="sr-only">{reactionWords.chip(emoji, names)}</span>
          </>
        );
        return (
          <Tooltip key={emoji} text={reactionWords.who(emoji, names)} visualOnly>
            {(trigger) =>
              canReact ? (
                <button
                  type="button"
                  {...trigger}
                  data-chip={emoji}
                  aria-pressed={mine}
                  onClick={() => onToggle(emoji)}
                  className={look}
                >
                  {content}
                </button>
              ) : (
                <span data-chip={emoji} className={look}>
                  {content}
                </span>
              )
            }
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * The round "Add a reaction" button beside a message (sketch sections 2 and 3). It shows while the
 * pointer is on the message or focus is in it, and opens a row of the six: a menu of
 * `menuitemcheckbox` items that the arrows, Home and End move through. A pick or Escape closes it
 * and focus goes back to the button; Tab or a click elsewhere closes it too. The row opens above
 * the message, or below where the transcript has no room above it.
 */
export function AddReaction({
  reactions,
  onToggle,
  author,
}: Omit<MessageReactionsProps, "canReact"> & {
  /** Whose message it is, for the row's name; undefined for the person's own. */
  readonly author: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) row.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')?.focus();
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  // Focus going anywhere but the row or its button, as a click elsewhere does, closes the row.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const to = event.relatedTarget;
    if (to !== button.current && !event.currentTarget.contains(to)) setOpen(false);
  };
  return (
    <div
      data-add-reaction
      className={`relative shrink-0 ${open ? "" : "opacity-0 group-hover/message:opacity-100 focus-within:opacity-100"}`}
    >
      <Tooltip text={reactionWords.add} isName>
        {(trigger) => (
          <button
            ref={button}
            type="button"
            {...trigger}
            aria-label={reactionWords.add}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => {
              if (open) return close(true);
              setBelow(noRoomAbove(button.current));
              setOpen(true);
            }}
            className="flex size-7 items-center justify-center rounded-full border border-border-strong bg-surface-raised text-fg-muted shadow-1"
          >
            <span className="size-4">
              <SmileyPlusIcon />
            </span>
          </button>
        )}
      </Tooltip>
      {open ? (
        <div
          ref={row}
          role="menu"
          aria-label={reactionWords.reactTo(author)}
          aria-orientation="horizontal"
          onKeyDown={(event) => onRowKey(event, close)}
          onBlur={onBlur}
          className={`absolute end-0 z-10 flex gap-0.5 rounded-full bg-surface-raised p-1 shadow-2 ${below ? "top-full mt-1" : "bottom-full mb-1"}`}
        >
          {reactionEmoji.map((emoji) => {
            const mine = isMine(reactions, emoji);
            return (
              <button
                key={emoji}
                type="button"
                role="menuitemcheckbox"
                aria-checked={mine}
                aria-label={reactionWords.name(emoji)}
                tabIndex={-1}
                onClick={() => {
                  onToggle(emoji);
                  close(true);
                }}
                className={`size-8 rounded-full border text-body ${mine ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-muted"}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** The row's keys: the arrows, Home and End move; Escape closes it, and so does Tab, moving on. */
function onRowKey(event: KeyboardEvent<HTMLDivElement>, close: (refocus: boolean) => void): void {
  if (event.key === "Escape") {
    event.preventDefault();
    close(true);
    return;
  }
  if (event.key === "Tab") {
    close(false);
    return;
  }
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = nextIndex(event.key, at, items.length);
  if (next === undefined) return;
  event.preventDefault();
  items[next]?.focus();
}

/** Where a key moves in a row of `count`, wrapping round; undefined for a key that doesn't move. */
function nextIndex(key: string, at: number, count: number): number | undefined {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (at + 1) % count;
  if (key === "ArrowLeft") return (at - 1 + count) % count;
  return undefined;
}

/** Whether the transcript has too little room above the button for the row of six. */
function noRoomAbove(button: HTMLElement | null): boolean {
  const transcript = button?.closest("[data-transcript]");
  if (button === null || transcript == null) return false;
  return (
    button.getBoundingClientRect().top - transcript.getBoundingClientRect().top < ROOM_ABOVE_PX
  );
}

/**
 * A smiley with a plus, in the text colour. A stand-in until the kit has its own (HAL-19684).
 */
function SmileyPlusIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M13 7.5A5.5 5.5 0 1 1 7.5 2" />
      <path d="M5 9.5c.6.9 1.5 1.4 2.5 1.4s1.9-.5 2.5-1.4" />
      <path d="M5.5 6h.01M9.5 6h.01" />
      <path d="M13 1v4M11 3h4" />
    </svg>
  );
}
