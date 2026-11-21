# workflow.validate-foreach-items

- Status: active
- Since: unreleased
- Source: HAL-14303, from Nina's check of a fresh project (C340 C35, HAL-14271)

If a for-each step's `items` isn't one placeholder and nothing else, or is one whose path starts with neither `input` nor `context`, then the workflow rules shall report the error `items-not-a-list` at `items`, because the engine fails the run on a list that is a text or nothing. The message is `"<step>" goes through "<items>", which is a text, not a list. Write one placeholder, such as "{{context.topics}}".` for the first, and `"<step>" goes through {{<path>}}, which gives nothing. Read the list from input or context, such as "{{context.<path>}}".` for the second. A `context.<key>` the step can't read is `unknown-template-name` (`workflow.validate-template-names`); whether `input.<name>` is a list is only known when the run starts, so it isn't reported here.

## Examples

- Given the for-each step `each` with `items: "Topics: {{context.topics}}"`, when it is checked, then the error says `"each" goes through "Topics: {{context.topics}}", which is a text, not a list.` at `states.each.items`.
- Given `items: "{{topics}}"`, when it is checked, then the error says `"each" goes through {{topics}}, which gives nothing. Read the list from input or context, such as "{{context.topics}}".`
- Given `items: "{{input.topics}}"` or `items: "{{ context.topics }}"` after a step writes `topics`, when it is checked, then there is no `items-not-a-list` error.
