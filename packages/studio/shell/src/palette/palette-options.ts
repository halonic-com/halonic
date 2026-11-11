import type { ItemKindContribution } from "../points/item-kinds.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { PressedKey } from "../tabs/window-keys.ts";
import type { PaletteContent, PaletteRow } from "./palette-groups.ts";

/** What a key pressed in the palette's box does (component specs 24.3, UX checklist 1.7). */
export type PaletteKey =
  /** ↓ and ↑ make the next or the previous row active, wrapping at the ends. */
  | { readonly kind: "move"; readonly step: 1 | -1 }
  /** Enter opens the active row here, Mod Enter in a new tab. */
  | { readonly kind: "open"; readonly inNewTab: boolean }
  /** Tab and Shift Tab stay in the box. */
  | { readonly kind: "stay" }
  /** Mod K while the palette is open selects the box's words rather than closing it (P2). */
  | { readonly kind: "select-words" };

/**
 * The palette key a press in the box means, if any. Home and End are left to the box, so they
 * move in the text. Esc isn't here: it cancels the dialog, as any Dialog's does.
 */
export function paletteKeyFor(
  pressed: PressedKey,
  platform: KeyboardPlatform,
): PaletteKey | undefined {
  if (pressed.altKey) {
    return undefined;
  }
  const mod = platform === "macos" ? pressed.metaKey : pressed.ctrlKey;
  const otherMod = platform === "macos" ? pressed.ctrlKey : pressed.metaKey;
  if (pressed.key === "Tab") {
    return mod || otherMod ? undefined : { kind: "stay" };
  }
  if (otherMod || pressed.shiftKey) {
    return undefined;
  }
  if (pressed.key === "Enter") {
    return { kind: "open", inNewTab: mod };
  }
  if (mod) {
    return pressed.key.toLowerCase() === "k" ? { kind: "select-words" } : undefined;
  }
  if (pressed.key === "ArrowDown") {
    return { kind: "move", step: 1 };
  }
  if (pressed.key === "ArrowUp") {
    return { kind: "move", step: -1 };
  }
  return undefined;
}

/** The palette's rows in reading order, group after group: the combobox's options. */
export function paletteOptions(content: PaletteContent): readonly PaletteRow[] {
  return content.groups.flatMap((group) => group.rows);
}

/**
 * The key of the row that is active after a move: the next or the previous one, wrapping from
 * the last to the first and back. With no active row, ↓ starts at the first and ↑ at the last.
 */
export function movedActive(
  options: readonly PaletteRow[],
  activeKey: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (options.length === 0) {
    return undefined;
  }
  const index = options.findIndex((row) => row.key === activeKey);
  if (index === -1) {
    return (step === 1 ? options[0] : options.at(-1))?.key;
  }
  const next = (index + step + options.length) % options.length;
  return options[next]?.key;
}

/** What changed since the palette last chose its active row. */
export interface ActiveRowChange {
  /** The box's words are new, so the content is for a new search. */
  readonly wordsChanged: boolean;
  /** The user moved the active row with ↓ or ↑ since the words last changed. */
  readonly picked: boolean;
}

/**
 * The key of the row that is active once the content changes. New words make the first row
 * active (T2-F22, F24). For the same words, a row the user picked stays active while it is still
 * listed, so results that arrive late don't move the user's choice. A row the palette made active
 * by itself is not a choice: late results make the new first row active, so Enter opens the best
 * match.
 */
export function keptActive(
  options: readonly PaletteRow[],
  activeKey: string | undefined,
  change: ActiveRowChange,
): string | undefined {
  const keepsPick = !change.wordsChanged && change.picked;
  if (keepsPick && options.some((row) => row.key === activeKey)) {
    return activeKey;
  }
  return options[0]?.key;
}

/** The names of the item kinds, as `studio.itemKinds.add` registered them. */
export interface PaletteKindNames {
  get(kind: string): Pick<ItemKindContribution, "label"> | undefined;
}

/**
 * An option's name for a screen reader: its name, its kind when it has one, and "switch to tab"
 * when a window tab shows it already, such as "Support reply, workflow, switch to tab" (24.3).
 * An item's kind is read with the name its kind was registered with, the word the row shows,
 * never its id; a kind that isn't registered is left out.
 */
export function paletteOptionName(row: PaletteRow, kinds: PaletteKindNames): string {
  const parts = [row.label];
  const kind = rowKind(row, kinds);
  if (kind !== undefined) {
    parts.push(kind);
  }
  if (row.open) {
    parts.push("switch to tab");
  }
  return parts.join(", ");
}

function rowKind(row: PaletteRow, kinds: PaletteKindNames): string | undefined {
  switch (row.target.kind) {
    case "location":
      return row.target.location.kind;
    case "item": {
      const label = kinds.get(row.target.item.kind)?.label;
      return label === undefined ? undefined : inSentence(label);
    }
    case "action":
      return undefined;
  }
}

/** A kind's name as it reads after a comma: "Agent" as "agent", but "MCP server" as it is. */
function inSentence(label: string): string {
  const [first = "", second = ""] = label;
  return second !== second.toLowerCase() ? label : first.toLowerCase() + label.slice(first.length);
}

/**
 * What the palette says politely once typing stops: "7 results", "1 result" or "No results"
 * (microcopy 19.2), counting the rows of every group. When the palette shows "Couldn't search"
 * because a search provider failed, it says so first: "Couldn't search" when nothing else
 * shows, and "Couldn't search, 1 result" when an action still matches, so a screen reader hears
 * what the line above the actions says.
 */
export function resultCountText(content: PaletteContent): string {
  const count = paletteOptions(content).length;
  if (count === 0) {
    return content.couldNotSearch ? "Couldn't search" : "No results";
  }
  const results = count === 1 ? "1 result" : `${count} results`;
  return content.couldNotSearch ? `Couldn't search, ${results}` : results;
}

/** How long typing must stop before the count is said (component specs 24.3). */
export const resultCountDelayMs = 500;
