# harness-opencode.house-rules

- Status: active
- Since: unreleased
- Source: HAL-17078 (board ask HAL-17074: the Variant lab's V53 house rules as the default for OpenCode writers)

When the OpenCode harness writes the task's prompt to OpenCode's standard input, it shall first write the house rules block, then a blank line, then the task's prompt unchanged. The house rules block shall be exactly:

```text
HOUSE RULES (read first):
1. Do not edit, weaken or delete existing tests. Add new tests for new behaviour instead.
2. Do not change existing user-facing wording or requirements unless the task explicitly asks for that change.
3. Reuse the repository's existing names, error classes and helpers; do not invent parallel ones.
4. Keep the change to what the task asks.
```

The house rules are information only: the harness shall not make any file read-only because of them.

## Examples

- Given an OpenCode run for the prompt "What does hello.txt say?",
  when OpenCode reads its standard input to the end,
  then it reads the house rules block, a blank line and "What does hello.txt say?", in that order.
