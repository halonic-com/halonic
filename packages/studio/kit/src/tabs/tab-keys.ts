/** Which way a tab list runs: a row of tabs, or a column of them beside its panel. */
export type TabOrientation = "horizontal" | "vertical";

/** The arrow keys that move to the next and previous tab, along the list's own direction. */
const arrowKeys = {
  horizontal: { next: "ArrowRight", previous: "ArrowLeft" },
  vertical: { next: "ArrowDown", previous: "ArrowUp" },
} as const;

/**
 * The tab a key moves to, skipping disabled tabs and wrapping round; none for other keys. Only
 * the arrows along the list count, so ↑ and ↓ do nothing in a row, nor ← and → in a column.
 */
export function keyTarget<Id extends string>(
  key: string,
  orientation: TabOrientation,
  enabled: readonly { readonly id: Id }[],
  current: Id | undefined,
): Id | undefined {
  if (enabled.length === 0) {
    return undefined;
  }
  // -1 when the current tab is disabled: then "next" goes to the first tab and "previous" to the last.
  const at = enabled.findIndex((tab) => tab.id === current);
  switch (key) {
    case arrowKeys[orientation].next:
      return enabled[(at + 1) % enabled.length]?.id;
    case arrowKeys[orientation].previous:
      return enabled[at === -1 ? enabled.length - 1 : (at - 1 + enabled.length) % enabled.length]
        ?.id;
    case "Home":
      return enabled[0]?.id;
    case "End":
      return enabled[enabled.length - 1]?.id;
    default:
      return undefined;
  }
}
