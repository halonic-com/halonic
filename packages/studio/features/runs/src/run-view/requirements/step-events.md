# runs.run-view.step-events

- Status: active
- Since: 0.1.0
- Source: [ux-checklists-t8-t9](/HAL/issues/HAL-1360#document-ux-checklists-t8-t9) part 1, 1.10; [design-runs](/HAL/issues/HAL-176#document-design-runs) 3, Every step; kit 24.2's token line; the headings and the empty line by Elena, a team decision under HAL-2282 (HAL-1301)

When the person opens an entry of Every step with Enter or a click, the run page shall show that step's events in a side panel titled with the step's name: its model calls, each with the model and "1,204 in · 312 out" (or "cached, no model call"), then its tool calls, each named by its tool with its arguments folded until the person opens them. The calls of a parallel branch or a for-each item shall count as their step's. Every value from the log shall be plain text, with every hidden or direction-changing character written as its `\uXXXX` escape (`std.hidden-characters`). The open entry shall be the timeline's current row, and closing the panel with ✕ or Escape shall move focus back to that entry.

## Examples

- Given step Draft made one call to claude-sonnet with 1204 tokens in and 312 out, and called send_email,
  when the person opens Draft's entry,
  then the panel reads "claude-sonnet 1,204 in · 312 out" under Model calls, and send_email, closed, under Tool calls.
- Given a step that made no calls,
  when the person opens its entry,
  then the panel reads "This step made no model or tool calls."
- Given the panel is open for Draft,
  when the person presses Escape,
  then the panel closes and focus is on Draft's entry.
