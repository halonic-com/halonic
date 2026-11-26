# messenger.question-cards

- Status: active
- Since: unreleased
- Source: the board's report on HAL-10 (25 Nov, 18:43 UTC); HAL-18762 plan, approved by Liam; HAL-18902; builds on HAL-17421 render 4e; an ended card goes away, the board's addition on HAL-10 (comment 910fe451), HAL-19496

When a card in a conversation's timeline asks several questions, or one answered with several options (its `questions`), the Messenger shall show each question with its prompt as a `fieldset` and `legend`, with a radio per option for a question that takes one pick and a checkbox per option for one that takes several, and a **Submit** button that is unavailable until every required question has a pick, as the kit's `kit.question-form`. When the person presses Submit, the Messenger shall answer the card with one `answers` answer through `AgentMessaging.answer`, holding the options picked for each question. When such a card is answered, it shall show its final state and then go, as `messenger.final-state` says. When the person presses the cards bar, focus shall go to the open card's first option.

## Examples

- Given Chief's open card "Three open decisions" with the questions "Where does ToolScript live?", "Which OpenUI looks?" (several picks) and "Start phase 2?",
  when the board picks "Separate repo", ticks "Dark" and "Wide", picks "Next week" and presses Submit,
  then the card is answered with `repo: separate`, `look: dark, wide` and `phase: later` in one answer.
- Given the same card answered on 24 Nov before the chat opened,
  when the board opens the chat,
  then the card isn't shown.
