# inbox.question-cards

- Status: active
- Since: unreleased
- Source: the board's report on HAL-10 (25 Nov, 18:43 UTC); HAL-18762 plan, approved by Liam; HAL-18902

When an agent's inbox item asks several questions, or one answered with several options (its `questions`), the Inbox's card shall show them as the kit's `kit.question-form`, with no reply field and no option buttons: each prompt as a `fieldset` and `legend`, radios for a question that takes one pick, checkboxes for one that takes several, and **Submit**, unavailable until every required question has a pick or while the source is offline or signed out. When the person presses Submit, the Inbox shall answer the item with one `answers` answer through `AgentMessaging.answer`. When the item is answered with an `answers` answer, here or elsewhere, the card shall keep the picked options ticked, make every radio and checkbox unavailable, and show "Answered ‹day›", such as "Answered 24 Nov", under the line that says by whom and how.

## Examples

- Given an open item "Three open decisions" with a multi-select question "Which OpenUI looks?",
  when the person picks "In the monorepo", ticks "Compact" and "Wide" and presses Submit,
  then the item is answered with `repo: mono` and `look: compact, wide` in one answer.
- Given the same item answered by Liam on 24 Nov at 18:43 with "Separate repo", "Dark" and "Compact",
  when the Inbox shows it,
  then those options are ticked, every option is unavailable, and the card says "Answered 24 Nov".
