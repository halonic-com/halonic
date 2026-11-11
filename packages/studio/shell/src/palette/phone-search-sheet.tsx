import { Button, CloseIcon, Input, SearchIcon, SheetFrame } from "@halonicjs/studio-kit";
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { PaletteContent, PaletteRow } from "./palette-groups.ts";
import { type PaletteKindNames, paletteKeyFor, paletteOptions } from "./palette-options.ts";
import { PaletteResults, paletteOptionId } from "./palette-results.tsx";
import { useActiveOption, useResultCount } from "./use-palette-box.ts";

/** Props for {@link PhoneSearchSheet}. */
export interface PhoneSearchSheetProps {
  readonly words: string;
  readonly onWordsChange: (words: string) => void;
  /** What `paletteGroups` made of the words, with no open tabs, and what the providers found. */
  readonly content: PaletteContent;
  /** Search providers are still looking for these words. */
  readonly searching: boolean;
  /** For an external keyboard's ↓, ↑ and Enter. */
  readonly platform: KeyboardPlatform;
  readonly kinds: PaletteKindNames;
  /** Why it couldn't search: `shell.engine.words.notAnswering`. */
  readonly notAnswering: string;
  /** The window's announcer, for the count once typing stops. */
  readonly announcer: Announcer;
  readonly iconFor?: ((row: PaletteRow) => ReactNode) | undefined;
  /** Opens or runs a row: a tap, or Enter in the field for the first row. */
  readonly onOpen: (row: PaletteRow) => void;
  /** Asks the search providers again, from **Try again** on "Couldn't search". */
  readonly onTryAgain: () => void;
  /** Close, and Android back. The screen unmounts the sheet. */
  readonly onClose: () => void;
}

/**
 * The phone's Search sheet (component specs 24.3 "On a phone", UX checklist 1.14, VK T2-F15 to
 * F19): the Ctrl K palette laid out as a full-screen picker-style sheet. **Close** and the title
 * "Search" at the top, then the search field with the focus in it and its clear button, then the
 * same groups, rows, words and match marks as the desktop palette. A row is 56px with its kind
 * line and 48px without; there is no footer and no key hints.
 *
 * The field is a combobox over the results, as on the desktop: Enter opens the first row, or the
 * one an external keyboard's ↓ and ↑ moved to. Touch has no active row, so the active row's bar
 * shows only once an arrow key moved it. The count is said politely once typing stops, as on the
 * desktop.
 *
 * It holds only the active option. The words, the content and what opening does belong to the
 * screen that shows it; nothing typed shows Recent only, since a phone has no window tabs.
 *
 * @example
 * {searchOpen ? (
 *   <PhoneSearchSheet words={words} onWordsChange={setWords} content={content}
 *     searching={pending} platform="linux" kinds={shell.itemKinds}
 *     notAnswering={shell.engine.words.notAnswering} announcer={shell.announcer}
 *     onOpen={open} onTryAgain={search} onClose={() => setSearchOpen(false)} />
 * ) : null}
 */
export function PhoneSearchSheet(props: PhoneSearchSheetProps) {
  const { words, content, searching } = props;
  const listId = useId();
  const box = useRef<HTMLInputElement>(null);
  const active = useActiveOption(paletteOptions(content), words);
  const [keyboardMoved, setKeyboardMoved] = useState(false);
  useResultCount(props.announcer, words, content, searching);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    const key = paletteKeyFor(event, props.platform);
    if (key === undefined || key.kind === "select-words") {
      return;
    }
    event.preventDefault();
    if (key.kind === "move") {
      setKeyboardMoved(true);
      active.move(key.step);
    } else if (key.kind === "open" && active.row !== undefined) {
      // A phone has no window tabs, so Mod Enter opens here too.
      props.onOpen(active.row);
    }
  };
  const clear = () => {
    props.onWordsChange("");
    box.current?.focus();
  };
  const onTryAgain = () => {
    // The retry removes the "Couldn't search" line and the focused button with it.
    box.current?.focus();
    props.onTryAgain();
  };
  const shownActive = keyboardMoved ? active.row : undefined;

  return (
    <SheetFrame
      title="Search"
      onClose={props.onClose}
      onCancel={props.onClose}
      // You opened it to type, so the focus goes to the field, not the title (a11y 1.7).
      initialFocus={() => box.current}
    >
      <div className="px-4 pt-3 pb-2">
        <Input
          ref={box}
          type="text"
          role="combobox"
          aria-label="Search"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shownActive && paletteOptionId(listId, shownActive)}
          placeholder="Search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          value={words}
          onChange={(event) => props.onWordsChange(event.target.value)}
          onKeyDown={onKeyDown}
          leadingIcon={<SearchIcon />}
          trailing={
            words === "" ? undefined : (
              <Button
                variant="ghost"
                size="sm"
                icon={<CloseIcon />}
                label="Clear"
                onClick={clear}
              />
            )
          }
        />
      </div>
      <PaletteResults
        id={listId}
        words={words}
        content={content}
        searching={searching}
        activeKey={shownActive?.key}
        kinds={props.kinds}
        notAnswering={props.notAnswering}
        iconFor={props.iconFor}
        onOpen={(row) => props.onOpen(row)}
        onTryAgain={onTryAgain}
        phone
      />
    </SheetFrame>
  );
}
