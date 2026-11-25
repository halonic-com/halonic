# harness-opencode.house-rules

- Status: active
- Since: unreleased
- Source: HAL-17078 (board ask HAL-17074: the Variant lab's V53 house rules as the default for OpenCode writers); HAL-18840 (only for tasks that ask for them)

When the OpenCode harness writes the prompt of a task that sets `houseRules` to OpenCode's standard input, it shall first write the house rules block, then a blank line, then the task's prompt unchanged. For a task without `houseRules`, it shall write the task's prompt unchanged and nothing before it. The house rules block shall be exactly:

```text
HOUSE RULES (read first):
1. Do not edit, weaken or delete existing tests. Add new tests for new behaviour instead.
2. Do not change existing user-facing wording or requirements unless the task explicitly asks for that change.
3. Reuse the repository's existing names, error classes and helpers; do not invent parallel ones.
4. Keep the change to what the task asks.
```

The house rules are information only: the harness shall not make any file read-only because of them.

## Examples

- Given an OpenCode run for a task with `houseRules` and the prompt "What does hello.txt say?",
  when OpenCode reads its standard input to the end,
  then it reads the house rules block, a blank line and "What does hello.txt say?", in that order.
- Given an OpenCode run for a task without `houseRules` and the prompt "Summarise this week's notes.",
  when OpenCode reads its standard input to the end,
  then it reads only "Summarise this week's notes.".
