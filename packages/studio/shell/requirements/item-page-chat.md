# shell.item-page-chat

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); req-shell `item-page.chat-and-panel`, `item-page.chat-starts-open`, `item-page.close-panel` and `panels.narrow-becomes-button` (HAL-110); UX checklist part 1, 1.10 (HAL-1323); visual review kit T6-F21 (HAL-1115)

Where a feature provides a chat for the item's kind, the shell's `ItemPage` shall show the chat on the left and the picked view in a panel on the right, as wide as `shell.panel-width` allows, with a ✕ named "Close <view>" at the header's right end. When the page first opens, it shall start with the chat open if the feature says so, and otherwise show the view across the tab with an "Ask about this <kind>…" button in the header that opens the chat; the chat can close itself again. When the user presses the panel's ✕, the shell shall hide the panel and the views nav, centre the chat at reading width, and show a button named after the view that shows the panel again. While the tab has no room for the panel beside the chat, the shell shall show only the chat with the same button, which opens the panel as the tab's own screen with a **← Chat** button that brings the chat back. After each of these buttons, focus shall move to what took its place: the picked view's tab, the button that brings the panel back, the chat, or "Ask about…". Switching between these layouts, by a button or by the tab's width, shall keep the chat and the view as they were, with a half-typed message or a view's unsaved changes. Where no feature provides a chat for the kind, the view shall take the whole tab with no "Ask about…", ✕ or **← Chat**.

## Examples

- Given agent "Refund checker" whose chat starts open, in a 1600px tab,
  when its page opens,
  then the chat is on the left, Configuration is in a 700px panel on the right, and the header ends with "Close Configuration".
- Given skill "summarise" whose chat starts closed,
  when its page opens,
  then the skill fills the tab and the header shows "Ask about this skill…"; pressing it opens the chat.
- Given that page with its panel shown,
  when the user presses "Close Configuration",
  then the chat takes the middle of the tab, the views nav is gone, and focus is on a "Configuration" button that shows the panel again.
- Given a tab 800px wide,
  when the agent's page opens,
  then only the chat shows, with a "Configuration" button; pressing it shows the panel across the tab with **← Chat**, and widening the tab to 1200px puts the panel beside the chat again.
- Given workflow "Support reply" with no chat for workflows,
  then Flow fills the tab and the header has no "Ask about…", ✕ or **← Chat**.
