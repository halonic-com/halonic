# inbox.answer-refused

- Status: active
- Since: unreleased
- Source: HAL-19350 (board report on HAL-10, 26 Nov: Submit on a card in the Inbox gave no feedback)

When the source refuses the answer to an agent's item for any reason other than being offline or signed out, such as `bad-answer` or `not-found`, the Inbox shall show the card's failure line, "Couldn't record your decision.", with **Try again**, as it does when sending fails. Offline or signed out, the card shall show the source's own line once the source is read again.

## Examples

- Given Chief's open question and a source that refuses its answer with `bad-answer`,
  when the board presses Yes,
  then the card says "Couldn't record your decision." with Try again, and Try again sends the same answer.
