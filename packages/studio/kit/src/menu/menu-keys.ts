/** How long typed letters add up to one search before they start a new one (type-to-find). */
export const TYPE_TO_FIND_MS = 500;

/** What the Menu's keyboard needs to know of an item. */
export interface KeyItem {
  readonly label: string;
  /** Skipped by the arrow keys and type-to-find, but still listed. */
  readonly disabled?: boolean | undefined;
}

/**
 * The item a navigation key moves to from `current` (-1 when none is active), skipping disabled
 * items. Arrows wrap round. `undefined` for any other key, or when every item is disabled.
 */
export function nextIndex(
  items: readonly KeyItem[],
  current: number,
  key: string,
): number | undefined {
  const enabled = items.flatMap((item, index) => (item.disabled === true ? [] : [index]));
  if (enabled.length === 0) {
    return undefined;
  }
  const position = enabled.indexOf(current);
  switch (key) {
    case "ArrowDown":
      return enabled[(position + 1) % enabled.length];
    case "ArrowUp":
      return enabled[position <= 0 ? enabled.length - 1 : position - 1];
    case "Home":
      return enabled[0];
    case "End":
      return enabled.at(-1);
    default:
      return undefined;
  }
}

/**
 * The first enabled item after `current` whose label starts with `typed`, ignoring case, going
 * round to the top. The active item itself is checked last, so typing its letter again moves on.
 */
export function findIndex(
  items: readonly KeyItem[],
  current: number,
  typed: string,
): number | undefined {
  const wanted = typed.toLocaleLowerCase();
  for (let step = 1; step <= items.length; step++) {
    const index = (current + step + items.length) % items.length;
    const item = items[index];
    if (
      item !== undefined &&
      item.disabled !== true &&
      item.label.toLocaleLowerCase().startsWith(wanted)
    ) {
      return index;
    }
  }
  return undefined;
}

/** A key that types a letter: one character, without Ctrl, Alt or ⌘. */
export function isTypedLetter(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}): boolean {
  return (
    event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.altKey && !event.metaKey
  );
}
