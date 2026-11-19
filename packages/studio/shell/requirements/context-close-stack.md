# shell.context-close-stack

- Status: draft
- Since: unreleased
- Source: HAL-13179 (T6, stacked cards on the agent page); flow-agents 7; req-shell `cards.go-back`

The window shall give every feature's context its close stack (`shell.close-stack`) as `closeStack`, on the desktop and on a phone, so a page that draws its own layer, such as an item page's stacked cards, closes it with Esc and Android's Back in rank order with the shell's own layers. A context built without a window shall have no `closeStack`.

## Examples

- Given a feature's Home card, then the context it gets has the window's `closeStack`.
- Given that card registers a stacked card with the context's `closeStack`, when Esc is pressed, then the card's close runs.
- Given a window narrower than 600px, then a feature's context still has the window's `closeStack`.
