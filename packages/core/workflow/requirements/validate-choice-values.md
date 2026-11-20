# workflow.validate-choice-values

- Status: active
- Since: 0.1.0
- Source: HAL-14268, from Nina's check of config mistakes (C337 C11, HAL-14257)

When the caller gives the options of the agents whose reply is a choice, and a transition's `when` has an `equals` or `notEquals` (also inside `not`, `all` or `any`) of a whole `{{context.<key>}}` with a text that has no placeholder, and every step that writes `<key>` writes the choice of the same agent (no `method`, no `format` of its own), and the text, without the spaces around it, isn't one of that agent's options, then the workflow rules shall report the warning `not-a-choice` at the `when`, with the message `"<step>" compares context.<key> with "<text>", but the agent <agent> only answers <options>. Use one of those, or add "<text>" to the options of <agent>.`

## Examples

- Given Acme's support reply with `when: { equals: ["{{context.kind}}", junk] }` and the sorter's options `refund`, `question` and `spam`, when it is checked, then the warning is `"classify" compares context.kind with "junk", but the agent sorter only answers refund, question or spam. Use one of those, or add "junk" to the options of sorter.`
- Given the same comparison with no agent options given, or on a step that calls a method or sets `format`, when it is checked, then there is no `not-a-choice` warning.
