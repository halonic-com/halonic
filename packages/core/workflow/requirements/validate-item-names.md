# workflow.validate-item-names

- Status: active
- Since: unreleased
- Source: HAL-14303, from Nina's check of a fresh project (C340 C10+, HAL-14271)

If a for-each step's `input` or `with` has a placeholder that starts with any name but the item's (`item`, or the step's `as:` name), `index`, `input` or `context`, then the workflow rules shall report the error `unknown-item-name` at that key. For `{{item}}` in a step with `as: <name>`, the message is `"<step>" uses {{item}}, but its items are named <name> (as: <name>). Write {{<name>}}, or remove as: <name>.`; for any other name it is `"<step>" uses {{<root>}}, but each item is named <item>; a for-each step can read {{<item>}}, {{index}}, input and context.`, followed by `Did you mean {{<near>}}?` when exactly one of those is at most two edits away.

## Examples

- Given the for-each step `each` with `as: topic` and the input `Announce {{item}}`, when it is checked, then the error says `"each" uses {{item}}, but its items are named topic (as: topic). Write {{topic}}, or remove as: topic.` at `states.each.input`.
- Given the same step with the input `Announce {{topc}}`, when it is checked, then the error ends with `Did you mean {{topic}}?`.
- Given a for-each step without `as` whose input reads `{{item.title}}`, `{{index}}` and `{{context.owner}}` after a step writes `owner`, when it is checked, then there is no `unknown-item-name` error.
