# Decision: Home's one pane moves the keyboard focus when an item opens and closes

- Task: HAL-20839
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20839 (filed by the post-merge words and a11y check of #6872, HAL-20834, which asks for this EARS line)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nc9sVxKiseTOr5Ezs6j23bQ+4vjsiM1v+5mv1NOMiP4vNxNlYwhE+rknSQpFaWtarA4zj4hK8hGUzzivLL6FCQ==

## What changes

- `shell.home-view`: while the window is narrower than 900px, opening an item moves the focus to
  "Back to Home", and closing it moves the focus to that item's row, or to the first row if that
  row is gone, as on the Runs page. While the column shows no row (Home's first run: "New chat",
  then Back before the first message), the focus moves to the column's first control. The rows say which item they are with `data-row-id` and take
  the focus on their `role="gridcell"`, as the kit's `List` rows do. While an item is open the list
  column stays drawn but hidden, so its rows are there when the focus comes back. The wording
  doesn't change.

## Why

In one pane the list column and the open item replace each other. Opening an item removed the
focused row and pressing "Back to Home" removed that button, so keyboard and screen-reader users
landed on `body` (WCAG 2.4.3 Focus Order). The Runs page's one pane (`useRunsPanes`, #6861) already
moves the focus this way, and Home now does the same.

## Covers

- shell.home-view
