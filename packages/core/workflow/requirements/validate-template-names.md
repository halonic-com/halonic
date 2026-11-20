# workflow.validate-template-names

- Status: active
- Since: unreleased
- Source: HAL-14268, from Nina's check of config mistakes (C337 C10, HAL-14257); a signal's `data` from HAL-14303 (C340 C10+, HAL-14271)

If a step's `input`, `description`, `with` or `items`, a branch's `input` or `with`, a transition's `when` (its placeholders and its `exists` paths) or the step's `signal` `data` reads a `context.<key>` path, and `<key>` isn't one the step can read (see `workflow.context-before`; a `when` and the signal's `data` can also read what their own step writes), then the workflow rules shall report the error `unknown-template-name` at that key, with the message `"<step>" uses {{context.<key>}}, but no earlier step writes context.<key>.` followed by what to do: `Did you mean context.<near>?` when exactly one key the step can read is at most two edits away, else `Use one an earlier step writes: context.<a>, context.<b>.`, or `Write it in an earlier step first, with output.` when there is none. Only the first part after `context.` is checked; `input` paths are not checked here.

## Examples

- Given Acme's support reply with `when: { equals: ["{{context.knd}}", spam] }` on `classify`, which writes `kind`, when it is checked, then the error is `"classify" uses {{context.knd}}, but no earlier step writes context.knd. Did you mean context.kind?` at `states.classify.on.0.when`.
- Given the wait step `review` with the description `{{context.replly}}` after `draft` writes `reply`, when it is checked, then the error says `Did you mean context.reply?` at `states.review.description`.
- Given the first step reads `{{context.mail}}` and `{{input.mail}}`, when it is checked, then only `context.mail` is an error, and it says to write it in an earlier step first.
- Given the step `draft` writes `reply` and sends a signal whose data is `{ text: "{{context.rpely}}" }`, when it is checked, then the error says `Did you mean context.reply?` at `states.draft.signal.data`; with `{{context.reply}}`, which `draft` writes itself, there is none.
