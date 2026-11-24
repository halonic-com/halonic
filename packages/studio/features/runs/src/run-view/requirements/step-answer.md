# runs.run-view.step-answer

- Status: active
- Since: unreleased
- Source: option A of HAL-12421, approved by the board (24 Nov); HAL-62 receipt requirement RCPT-3.4; the heading reuses the dashed frame's approved words, a team decision under HAL-2282 (HAL-17831)

When the person opens an entry of Every step whose agents answered, the side panel shall show, after its Model calls and Tool calls, an Answer part in a dashed frame headed "Answer (its own words, not checked)", with each answer the step's agents gave, oldest first: its text as written, line breaks kept, or its JSON when the answer isn't text. A failed or empty answer shall be left out, and a step with no answer shall have no Answer part. The text shall be plain, by the dashed frame's rules: a Markdown link or image shows as text and loads nothing, and every hidden or direction-changing character is written as its `\uXXXX` escape.

## Examples

- Given an Acme Weekly report run whose step Write the report answered "This week: 12 emails. …",
  when the person opens that step's entry,
  then its panel has the Answer part reading "This week: 12 emails. …".
- Given an answer with `![x](https://example.com/x.png)` and a U+202E in it,
  then the Answer part shows those characters as text, the U+202E as `\u202e`, and no image is loaded.
- Given a step whose agent answered nothing,
  then its panel has no Answer part.
