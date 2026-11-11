import { Kbd, PaletteBox, SearchIcon } from "@halonicjs/studio-kit";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { PaletteContent, PaletteRow } from "./palette-groups.ts";
import {
  keptActive,
  movedActive,
  type PaletteKindNames,
  paletteKeyFor,
  paletteOptions,
  resultCountDelayMs,
  resultCountText,
} from "./palette-options.ts";
import { PaletteResults, paletteOptionId } from "./palette-results.tsx";

/** Props for {@link CommandPalette}. */
export interface CommandPaletteProps {
  readonly words: string;
  readonly onWordsChange: (words: string) => void;
  /** What `paletteGroups` made of the words and what the providers found so far. */
  readonly content: PaletteContent;
  /** Search providers are still looking for these words. */
  readonly searching: boolean;
  readonly platform: KeyboardPlatform;
  readonly kinds: PaletteKindNames;
  /** Why it couldn't search: `shell.engine.words.notAnswering`. */
  readonly notAnswering: string;
  /** The window's announcer, for the count once typing stops. */
  readonly announcer: Announcer;
  readonly iconFor?: ((row: PaletteRow) => ReactNode) | undefined;
  /** Opens or runs a row: here, or in a new tab with Mod Enter, a Mod-click or a middle-click. */
  readonly onOpen: (row: PaletteRow, inNewTab: boolean) => void;
  /** Asks the search providers again, from **Try again** on "Couldn't search". */
  readonly onTryAgain: () => void;
  /** Esc and a click outside. The screen unmounts the palette. */
  readonly onCancel: () => void;
}

/**
 * The Ctrl K palette (component specs 24.3, UX checklist 1.7, VK T2-F6 and F22 to F25): the kit's
 * PaletteBox with the search row at the top, the results under it and the footer's keys.
 *
 * The search row is a `combobox` that keeps the focus while ↓ and ↑ move the active option
 * through every group, wrapping at the ends. Enter opens the active option here and Mod Enter in
 * a new tab. New words make the first option active; for the same words, an option the user
 * picked stays active when late results arrive. Once typing stops for 500 ms, the count is said
 * politely: "7 results", "No results", "Couldn't search".
 *
 * It holds only the active option. The words, the content and what opening does belong to the
 * screen that shows it, so the palette works the same from Ctrl K and the sidebar's Search.
 *
 * @example
 * <CommandPalette words={words} onWordsChange={setWords} content={content} searching={pending}
 *   platform="windows" kinds={shell.itemKinds} notAnswering={shell.engine.words.notAnswering}
 *   announcer={shell.announcer} onOpen={open} onTryAgain={search} onCancel={close} />
 */
export function CommandPalette(props: CommandPaletteProps) {
  const { words, content, searching, platform } = props;
  const listId = useId();
  const box = useRef<HTMLInputElement>(null);
  const options = paletteOptions(content);
  const active = useActiveOption(options, words);
  useResultCount(props.announcer, words, content, searching);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    const key = paletteKeyFor(event, platform);
    if (key === undefined) {
      return;
    }
    event.preventDefault();
    // Mod K is also the window's key that opens the palette: here it only selects the words.
    event.stopPropagation();
    if (key.kind === "move") {
      active.move(key.step);
    } else if (key.kind === "select-words") {
      box.current?.select();
    } else if (key.kind === "open" && active.row !== undefined) {
      props.onOpen(active.row, key.inNewTab);
    }
  };
  const onRowClick = (row: PaletteRow, event: MouseEvent) => {
    const mod = platform === "macos" ? event.metaKey : event.ctrlKey;
    props.onOpen(row, mod || event.button === 1);
  };
  const onTryAgain = () => {
    // The retry removes the "Couldn't search" line and the focused button with it, so the
    // focus goes back to the search row before typing would land nowhere.
    box.current?.focus();
    props.onTryAgain();
  };

  return (
    <PaletteBox label="Search" initialFocus={() => box.current} onCancel={props.onCancel}>
      <SearchRow
        box={box}
        listId={listId}
        activeId={active.row && paletteOptionId(listId, active.row)}
        words={words}
        onWordsChange={props.onWordsChange}
        onKeyDown={onKeyDown}
      />
      <PaletteResults
        id={listId}
        words={words}
        content={content}
        searching={searching}
        activeKey={active.row?.key}
        kinds={props.kinds}
        notAnswering={props.notAnswering}
        iconFor={props.iconFor}
        onOpen={onRowClick}
        onTryAgain={onTryAgain}
      />
      <PaletteFooter platform={platform} />
    </PaletteBox>
  );
}

interface SearchRowProps {
  readonly box: RefObject<HTMLInputElement | null>;
  readonly listId: string;
  readonly activeId: string | undefined;
  readonly words: string;
  readonly onWordsChange: (words: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** The search row: the 56px top of the box, a combobox over the results that keeps the focus. */
function SearchRow({ box, listId, activeId, words, onWordsChange, onKeyDown }: SearchRowProps) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      <span aria-hidden="true" className="size-icon-md shrink-0 text-fg-muted *:size-full">
        <SearchIcon />
      </span>
      <input
        ref={box}
        type="text"
        role="combobox"
        aria-label="Search"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        spellCheck={false}
        data-text-entry=""
        value={words}
        onChange={(event) => onWordsChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 bg-transparent text-section font-normal text-fg outline-none"
      />
    </div>
  );
}

/** The keys under the results; hidden on a phone, which has no keyboard to press them on. */
function PaletteFooter({ platform }: { readonly platform: KeyboardPlatform }) {
  const mod = platform === "macos" ? "⌘" : "Ctrl";
  return (
    <div className="flex shrink-0 items-center gap-6 border-t border-border bg-surface-subtle px-4 py-2 text-caption text-fg-muted phone:hidden">
      <FooterKey keys={["Enter"]}>Open here</FooterKey>
      <FooterKey keys={[mod, "Enter"]}>Open in a new tab</FooterKey>
      <FooterKey keys={["Esc"]}>Close</FooterKey>
    </div>
  );
}

function FooterKey({
  keys,
  children,
}: {
  readonly keys: readonly string[];
  readonly children: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Kbd keys={keys} />
      {children}
    </span>
  );
}

/** The active option, chosen again whenever the words or the options change. */
function useActiveOption(options: readonly PaletteRow[], words: string) {
  const [key, setKey] = useState<string | undefined>(options[0]?.key);
  const picked = useRef(false);
  const shownWords = useRef(words);
  const optionKeys = options.map((option) => option.key).join("\n");

  // `optionKeys` stands for `options`: a new array with the same rows changes nothing.
  useEffect(() => {
    const wordsChanged = shownWords.current !== words;
    shownWords.current = words;
    if (wordsChanged) {
      picked.current = false;
    }
    setKey((current) => keptActive(options, current, { wordsChanged, picked: picked.current }));
  }, [optionKeys, words]);

  return {
    row: options.find((option) => option.key === key),
    move(step: 1 | -1) {
      picked.current = true;
      setKey((current) => movedActive(options, current, step));
    },
  };
}

/** Says the count politely once the words have rested 500 ms and the providers have answered. */
function useResultCount(
  announcer: Announcer,
  words: string,
  content: PaletteContent,
  searching: boolean,
) {
  const text = resultCountText(content);
  useEffect(() => {
    if (searching || words.trim() === "") {
      return;
    }
    const timer = setTimeout(() => announcer.announce(text), resultCountDelayMs);
    return () => clearTimeout(timer);
  }, [announcer, words, text, searching]);
}
