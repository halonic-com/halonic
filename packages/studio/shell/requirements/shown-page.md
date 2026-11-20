# shell.shown-page

- Status: active
- Since: unreleased
- Source: HAL-12458 (a11y check A8)

The window shall give every feature's context a read-only `shown()`: the page the window shows now, as a `ShownPage`. On the desktop it shall be the active tab's page and on a phone the phone's own page. It shall name a sidebar place's own page by its `place`, an item's page by its `item`, and anything else, such as a phone's list under a place, by neither.

## Examples

- Given a desktop window whose active tab shows the Inbox,
  when a feature reads `shown()`,
  then it is `{ place: "inbox" }`.
- Given a desktop window,
  when the active tab moves on to the run `acme/r1`,
  then `shown()` is `{ item: { kind: "run", hub: "acme", id: "r1" } }`, read from the same context.
- Given a phone window,
  when a view opens the Inbox,
  then `shown()` is `{ place: "inbox" }`.
- Given the phone's list `library/agents`,
  when its page is named,
  then it has neither a place nor an item.
