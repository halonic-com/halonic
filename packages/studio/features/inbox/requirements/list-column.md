# inbox.list-column

- Status: active
- Since: unreleased
- Source: HAL-20731; build plan HAL-20617, phases P3 and P5; `inbox.narrow-window`

While the Inbox shows its list and the open item side by side, the list column shall be 34 % of the page's width and at most 380px wide, and the content pane shall take the rest of the width, in Studio's window and in the Inbox's own window alike. While the Inbox shows one pane at a time (`inbox.narrow-window`), the list shall fill the page.

## Examples

- Given the Inbox in a 1280 × 800 window,
  then the list column is 34 % of the page, capped at 380px, and the content pane fills the rest.
- Given the Inbox in its own 1016 × 700 window, whose 8px frame leaves a 1000px page,
  then the list column is 340px wide beside the framed content pane.
- Given the Inbox in a 640 × 400 window,
  then the list fills the page.
