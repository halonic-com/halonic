# inbox.setup-item-open

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes "Inbox setup items"); first-run-flow 5, "Continue opens the screen where they left off" (HAL-7985); next to `inbox.setup-items` and `inbox.setup-pane`

Where the window can open an item's page, the Inbox shall give an open setup item's view a way to open one (`openItem`), so a setup source's own buttons can lead somewhere else in the Studio, such as the first run's **Continue** opening Support reply. Where the window can't open a page, the view shall get none.

## Examples

- Given the Inbox page in a window that can open items,
  when a setup item's view calls `openItem` with the workflow `support/support-reply`,
  then the window opens that workflow's page.
- Given an Inbox shown without a way to open items,
  when a setup item's view opens,
  then it gets no `openItem`.
