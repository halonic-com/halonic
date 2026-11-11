import { shownPanelWidth } from "../panels/panel-width.ts";

/** What the user did to an item page's chat and panel, kept by the page. */
export interface ItemLayoutChoices {
  /** The chat is open: from the start for agents and workflows, after "Ask about…" for the rest. */
  readonly chatOpen: boolean;
  /** The panel was hidden with its ✕, beside a chat. */
  readonly panelClosed: boolean;
  /** In a narrow tab, the panel's own screen is shown in place of the chat. */
  readonly panelScreen: boolean;
}

/**
 * How an item page shares its tab between the chat and the panel that shows the view
 * (`shell.item-page-chat`):
 *
 * - `view`: the view takes the whole tab. `ask` when a chat exists but is closed, so the header
 *   offers "Ask about this <kind>…".
 * - `chat-and-panel`: the chat on the left, the panel `panelWidth` wide on the right, with its ✕.
 * - `chat`: only the chat, centred at reading width, with a control named after the view that shows
 *   the panel: `reopen` after its ✕, `narrow` when the tab has no room for it beside the chat.
 * - `panel-screen`: in a narrow tab, the panel fills the tab with **← Chat**.
 */
export type ItemLayout =
  | { readonly shows: "view"; readonly ask: boolean }
  | { readonly shows: "chat-and-panel"; readonly panelWidth: number }
  | { readonly shows: "chat"; readonly panelControl: "reopen" | "narrow" }
  | { readonly shows: "panel-screen" };

/**
 * The layout of an item page in a tab `tabWidth` wide (`undefined` before it was measured, drawn
 * as wide) with the panel's chosen `panelWidth`. Without a chat for the kind, the view always
 * takes the whole tab, with no "Ask about…", ✕ or **← Chat**.
 *
 * @example
 * itemLayout({ hasChat: true, chatOpen: true, panelClosed: false, panelScreen: false }, 700, 1600);
 * // { shows: "chat-and-panel", panelWidth: 700 }
 * itemLayout({ hasChat: true, chatOpen: true, panelClosed: false, panelScreen: false }, 700, 800);
 * // { shows: "chat", panelControl: "narrow" }
 */
export function itemLayout(
  { hasChat, ...choices }: ItemLayoutChoices & { readonly hasChat: boolean },
  panelWidth: number,
  tabWidth: number | undefined,
): ItemLayout {
  if (!hasChat || !choices.chatOpen) {
    return { shows: "view", ask: hasChat };
  }
  const shownWidth = tabWidth === undefined ? panelWidth : shownPanelWidth(panelWidth, tabWidth);
  if (shownWidth === undefined) {
    return choices.panelScreen
      ? { shows: "panel-screen" }
      : { shows: "chat", panelControl: "narrow" };
  }
  if (choices.panelClosed) {
    return { shows: "chat", panelControl: "reopen" };
  }
  return { shows: "chat-and-panel", panelWidth: shownWidth };
}
