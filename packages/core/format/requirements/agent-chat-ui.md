# format.agent-chat-ui

- Status: active
- Since: unreleased
- Source: HAL-17646, OpenUI Part A (plan approved by the board on 23 Nov, HAL-17107; Liam's technical review, HAL-16863)

When `parseFile` reads an agent file, the format shall accept an optional `chatUi` block whose one field, `components`, lists the components the agent may draw in its Studio chat replies: `card`, `table`, `form` and `buttons`, at least one, each at most once. When the file leaves `chatUi` out, the parsed agent has no `chatUi`, so its replies use no components and older files read as before. An unknown component name fails at that list entry with a message that names it; an empty list, a name given twice, or any other field in the block fails. `chatUi` is separate from `output`: setting one doesn't change the other.

## Examples

- Given an agent with only an id and a name, when it is parsed, then it has no `chatUi`.
- Given `chatUi: { components: [card, table, form, buttons] }`, when it is parsed, then `chatUi.components` holds those four names in that order.
- Given `chatUi: { components: [table] }`, when it is parsed, then `chatUi.components` holds only `table`.
- Given `chatUi: { components: [card, chart] }`, when it is parsed, then it fails at `chatUi.components.1` with a message naming `"chart"` and the four known names.
- Given `chatUi: { components: [] }` or `chatUi: { components: [card, card] }`, when it is parsed, then it fails at `chatUi.components`.
- Given `chatUi: { components: [card], images: true }`, when it is parsed, then it fails with `unrecognized_keys` at `chatUi`.
- Given `output: { type: choice, options: [yes, no] }` and `chatUi: { components: [buttons] }`, when it is parsed, then `output` is that choice and `chatUi` holds `buttons`; given only `chatUi`, `output` stays `{ type: text }`.
