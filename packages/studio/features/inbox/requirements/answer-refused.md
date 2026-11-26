# inbox.answer-refused

- Status: active
- Since: unreleased
- Source: HAL-19350 (board report on HAL-10, 26 Nov: Submit on a card in the Inbox gave no feedback); HAL-19374 (no Try again on `bad-answer`)

When the source refuses the answer to an agent's item for any reason other than being offline, signed out or `bad-answer`, such as `not-found`, the Inbox shall show the card's failure line, "Couldn't record your decision.", with **Try again**, as it does when sending fails. When the source refuses it with `bad-answer`, the card shall show "Couldn't record your decision. Your answer doesn't fit this card, so answer it in Paperclip." with no **Try again**, since the same answer would be refused again. Offline or signed out, the card shall show the source's own line once the source is read again.

## Examples

- Given Chief's open question and a source that refuses its answer with `bad-answer`,
  when the board presses Yes,
  then the card says "Couldn't record your decision. Your answer doesn't fit this card, so answer it in Paperclip." and shows no Try again.
- Given Chief's open question and a source that refuses its answer with `not-found`,
  when the board presses Yes,
  then the card says "Couldn't record your decision." with Try again, and Try again sends the same answer.
