# runs.run-view.agent-says

- Status: active
- Since: unreleased
- Source: HAL-62 receipt requirements RCPT-3.1, RCPT-3.4 and acceptance check 2; ux-checklists-t8-t9 (HAL-1360) part 1, 1.9; design-runs (HAL-176) 3, Finished (HAL-12404)

When an agent of the run answered, the run page shall show, after the receipt and before Every step, a dashed frame named "What the agent says it did (its own words, not checked)" with the last answer an agent of the run gave: its text as written, line breaks kept, or its JSON when the answer isn't text. An agent that failed, or answered with nothing, shall be passed over for the one before it, and a run with no answer shall have no frame. The text shall be plain: a Markdown link or image in it shows as text and loads nothing, and every hidden or direction-changing character is written as its `\uXXXX` escape. The receipt's own lines shall never come from it.

## Examples

- Given a Weekly report run whose step Write the report answered "This week: 12 emails…",
  when its page is shown,
  then the frame after the receipt reads "This week: 12 emails…".
- Given an answer with the Markdown image `![x](https://example.com/x.png)`,
  when the page is shown,
  then the frame shows those characters as text and no image is loaded.
- Given a run whose last agent failed after an earlier agent answered "Sorted as refund",
  then the frame reads "Sorted as refund".
- Given a run in which no agent answered,
  then the page has no frame.
