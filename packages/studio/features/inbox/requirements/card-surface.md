# inbox.card-surface

- Status: active
- Since: unreleased
- Source: board report on HAL-10 via HAL-19362 ("Approval cards should have shadow"); Noah's fix note HAL-19574, from his check of #6429 on HAL-19551; builds on `inbox.agent-card-web-link`

The Inbox shall show every card in its item pane (an approval's, a wait step's, a run proposal's, a run at a plan limit's and an agent's) on the same lifted card surface: the kit's `bg-surface` background, a `border` in `border-border`, the `rounded-md` card radius and the `shadow-1` elevation, so an agent's card and a workflow's card look like the same kind of thing.

## Examples

- Given an open approval, wait step, run proposal, run at a plan limit or agent's item,
  when its card shows,
  then its card has `bg-surface`, `border`, `rounded-md` and `shadow-1`.
- Given a short window (at most 576px tall),
  when a card shows,
  then the card doesn't clip its content, so its bar of answers stays reachable by scrolling the item pane.
