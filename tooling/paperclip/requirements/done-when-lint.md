# paperclip.done-when-lint

- Status: active
- Since: unreleased
- Source: HAL-17403, part 3 of the spec template in HAL-17395

When the thin-spec check (`paperclip.thin-spec-check`) scores a task, the Agent tools plugin shall also, without any AI call, look in the task's description for a `Done when` line and count it as missing when there is none or when it names neither a test (a path matching `*.test.*` or `*.spec.*`, or the word test with the test's name in quotes or backticks), nor a command in backticks, nor a visible result ("sees", "shows", "prints", "exits"); for such a task it shall add one comment linking the HAL-17395 spec template and the check's "Clarify acceptance criteria" task (only one clarify task when the score flags the task too), log `doneWhenMissing` (boolean) next to the score, and otherwise behave as the thin-spec check does: only behind its switch, for the same tasks, never changing a task's title, description or assignee.

## Examples

- Given a new code task whose description has no `Done when` line and a clear score,
  when the plugin checks it,
  then it comments the template link, adds one clarify task and logs `doneWhenMissing: true`.
- Given "Done when: works",
  when the plugin checks it,
  then it counts the line as missing.
- Given "Done when: `pnpm check` passes", "Done when: src/export.test.ts passes" or "Done when: the user sees the export finish",
  when the plugin checks it,
  then it logs `doneWhenMissing: false` and comments nothing.
- Given a task the score flags and that has no `Done when` line,
  when the plugin checks it,
  then it adds one clarify task naming both reasons.
