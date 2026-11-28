# Decision: Home's one pane moves the keyboard focus when an item opens and closes

- Task: HAL-20839
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20839 (filed by the post-merge words and a11y check of #6872, HAL-20834, which asks for this EARS line); the reviewer signs this note in review
- Kind: user-visible

## What changes

- `shell.home-view`: while the window is narrower than 900px, opening an item moves the focus to
  "Back to Home", and closing it moves the focus to that item's row, or to the list column's first
  control if the row is gone. The rows say which item they are with `data-row-id`, as the Runs
  page's rows do. The wording doesn't change.

## Why

In one pane the list column and the open item replace each other. Opening an item removed the
focused row and pressing "Back to Home" removed that button, so keyboard and screen-reader users
landed on `body` (WCAG 2.4.3 Focus Order). The Runs page's one pane (`useRunsPanes`, #6861) already
moves the focus this way, and Home now does the same.

## Covers

- shell.home-view
