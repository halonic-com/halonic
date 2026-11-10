/** The side panel's width when nobody has changed it, and what a double-click goes back to. */
export const PANEL_DEFAULT_WIDTH = 700;
/** The narrowest the side panel gets beside the chat. */
export const PANEL_MIN_WIDTH = 420;
/** The widest the side panel gets. */
export const PANEL_MAX_WIDTH = 1400;
/** The narrowest the chat gets beside the panel. */
export const CHAT_MIN_WIDTH = 320;
/** The room at the tab's left edge before the chat. */
export const ITEM_PAGE_LEAD = 40;
/** The gap between the chat and the panel. */
export const PANEL_GAP = 48;

/** `width` kept inside 420 to 1400 and rounded to a whole pixel. */
export function clampPanelWidth(width: number): number {
  return Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width)));
}

/**
 * The width to start from, read back from what this computer saved (`shell.panel-width`): the
 * saved width kept inside 420 to 1400, or 700px for anything that isn't a finite number, such as
 * nothing saved yet or a damaged value.
 */
export function savedPanelWidth(saved: unknown): number {
  if (typeof saved !== "number" || !Number.isFinite(saved)) {
    return PANEL_DEFAULT_WIDTH;
  }
  return clampPanelWidth(saved);
}

/** The widest the panel can be in a tab this wide while the chat keeps 320px beside it. */
function roomForPanel(tabWidth: number): number {
  return tabWidth - ITEM_PAGE_LEAD - CHAT_MIN_WIDTH - PANEL_GAP;
}

/**
 * Whether the panel fits beside the chat in a tab this wide: a 420px panel beside a 320px chat,
 * with the gap and the lead. When it doesn't, the panel is a button in the chat's header.
 */
export function panelFitsBeside(tabWidth: number): boolean {
  return roomForPanel(tabWidth) >= PANEL_MIN_WIDTH;
}

/**
 * The width the panel takes beside the chat: the chosen `width`, narrowed so the chat keeps
 * 320px, but never under 420px. `undefined` when the panel doesn't fit beside the chat. The
 * chosen width itself stays as it is, so a wider tab gives it back.
 *
 * @example
 * shownPanelWidth(812, 1600); // 812
 * shownPanelWidth(812, 1000); // 592, the chat keeps 320px
 * shownPanelWidth(812, 800); // undefined, the panel is a button
 */
export function shownPanelWidth(width: number, tabWidth: number): number | undefined {
  if (!panelFitsBeside(tabWidth)) {
    return undefined;
  }
  return Math.min(clampPanelWidth(width), Math.floor(roomForPanel(tabWidth)));
}
