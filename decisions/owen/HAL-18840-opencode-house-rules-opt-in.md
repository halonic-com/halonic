# Decision: OpenCode gets the house rules only for tasks that ask for them

- Task: HAL-18840 (found in the words and a11y check HAL-18822, on #6185)
- Approval: HAL-18840, pending Liam's signature
- Kind: user-visible

## What changes

`harness-opencode.house-rules` said the OpenCode harness puts the V53 house rules block in front
of every task's prompt. It now says the block goes first only for a task that sets the new
`HarnessTask.houseRules`; any other task's prompt reaches OpenCode unchanged. The block's wording
is unchanged. The requirement gains a second example for a task without `houseRules`. No test or
golden file is weakened or removed: the existing test now sets `houseRules`, and a new test covers
a task without it.

## Why

Users can already pick `harness: opencode` in Studio, the agent format, the CLI and the desktop
agent host. Their own agents, for example one writing a summary, were getting our coding rules
("Do not edit, weaken or delete existing tests…") at the top of their prompt. The rules were meant
for Paperclip's OpenCode writers (HAL-17074), so they become opt-in. How the writer turns them on
is asked in HAL-18841.

## Covers

- harness-opencode.house-rules
