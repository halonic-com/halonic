import type { Message, MessagingId } from "@halonicjs/ports";
import { ChevronDownIcon, CloseIcon, Input, SearchIcon } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useRef, useState } from "react";
import { listWords } from "../list-words.ts";
import { holds } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";

const words = listWords.find;

/** What {@link useFind} gives: the find bar's state, and which messages it found. */
export interface Find {
  readonly open: boolean;
  readonly text: string;
  /** The messages that hold the text, oldest first; none while the text is empty. */
  readonly matches: readonly MessagingId[];
  /** Which of `matches` is shown: the newest at first. */
  readonly at: number;
  readonly field: RefObject<HTMLInputElement | null>;
  readonly show: () => void;
  readonly close: () => void;
  readonly setText: (text: string) => void;
  /** Moves to the older match, or the newer one, round the end. */
  readonly move: (step: -1 | 1) => void;
}

/**
 * The find bar of an open chat (`messenger.find-in-chat`): Ctrl+F (Cmd+F on macOS) opens it and puts
 * focus in its field, instead of the page's own find. The chat keeps every message; the bar counts
 * those that hold the text and moves between them, starting at the newest.
 */
export function useFind(messages: readonly Message[] | undefined): Find {
  const [open, setOpen] = useState(false);
  const [text, setTextState] = useState("");
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const field = useRef<HTMLInputElement>(null);
  const matches =
    text.trim() === ""
      ? []
      : (messages ?? []).filter((message) => holds(message.body, text)).map(({ id }) => id);
  const at = Math.min(chosen ?? matches.length - 1, matches.length - 1);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      setOpen(true);
      field.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return {
    open,
    text,
    matches,
    at,
    field,
    show: () => setOpen(true),
    close: () => {
      setOpen(false);
      setTextState("");
      setChosen(undefined);
    },
    setText: (next) => {
      setTextState(next);
      setChosen(undefined);
    },
    move: (step) => {
      if (matches.length === 0) return;
      setChosen((at + step + matches.length) % matches.length);
    },
  };
}

/** The header's icon that opens the find bar. */
export function FindButton({ find }: { readonly find: Find }) {
  return (
    <button
      type="button"
      data-find
      title={words.button}
      aria-label={words.button}
      aria-expanded={find.open}
      onClick={() => (find.open ? find.field.current?.focus() : find.show())}
      className="rounded-sm p-1 text-fg-muted hover:text-fg aria-expanded:text-fg focus-ring *:size-4"
    >
      <SearchIcon />
    </button>
  );
}

/**
 * Under the chat's header: the field, "2 of 5", up to the older match, down to the newer one, and
 * close (Sofia's sketch C on HAL-19134). Enter moves up, Shift+Enter down, Escape closes and puts
 * focus back on the header's icon.
 */
export function FindBar({
  find,
  onClosed,
}: {
  readonly find: Find;
  readonly onClosed: () => void;
}) {
  const close = () => {
    find.close();
    onClosed();
  };
  const searched = find.text.trim() !== "";
  return (
    <div data-find-bar className="flex items-center gap-2 border-b border-border px-4 py-2">
      <div className="w-80 max-w-full">
        <Input
          ref={find.field}
          size="sm"
          type="search"
          leadingIcon={<SearchIcon />}
          autoFocus
          aria-label={words.label}
          placeholder={words.label}
          value={find.text}
          onChange={(event) => find.setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
            if (event.key === "Enter") find.move(event.shiftKey ? 1 : -1);
          }}
        />
      </div>
      <p role="status" className="text-small text-fg-muted">
        {searched ? position(find) : ""}
      </p>
      <span className="flex-1" />
      <StepButton label={words.previous} up onClick={() => find.move(-1)} />
      <StepButton label={words.next} up={false} onClick={() => find.move(1)} />
      <StepButton label={words.close} onClick={close} />
    </div>
  );
}

function position(find: Find): string {
  if (find.matches.length === 0) return messengerWords.noMatches;
  return words.position(find.at + 1, find.matches.length);
}

/** An icon button of the bar: up or down a chevron, else the close cross. */
function StepButton({
  label,
  up,
  onClick,
}: {
  readonly label: string;
  readonly up?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-sm p-1 text-fg-muted hover:text-fg focus-ring *:size-4"
    >
      {up === undefined ? <CloseIcon /> : <Chevron up={up} />}
    </button>
  );
}

function Chevron({ up }: { readonly up: boolean }) {
  return (
    <span className={`inline-block size-4 *:size-full ${up ? "rotate-180" : ""}`}>
      <ChevronDownIcon />
    </span>
  );
}
