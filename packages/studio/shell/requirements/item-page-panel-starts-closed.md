# shell.item-page-panel-starts-closed

- Status: active
- Since: unreleased
- Source: HAL-16803 (T14 PR 12); flow-assistant 2.3 and 6.1 (HAL-647); mockup-assistant 5.3 (HAL-878)

Where a feature's chat for an item page says its panel starts closed, the shell's `ItemPage` shall open with the chat at reading width and the panel hidden, with the button named after the view that shows the panel again, as after the panel's ✕. When the page asks through its handle to show a view, the shell shall show the panel beside the chat again and move focus where the page asks.

## Examples

- Given a chat tab whose chat starts open with its panel closed, in a 1600px tab,
  when its page opens,
  then the chat takes the middle of the tab, the views nav is gone, and the header has an "Items" button that shows the panel.
- Given that page,
  when it asks its handle to show "Items" and keep focus in the box,
  then the panel shows beside the chat and focus stays in the box.
