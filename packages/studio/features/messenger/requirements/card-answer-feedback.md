# messenger.card-answer-feedback

- Status: active
- Since: unreleased
- Source: HAL-19350 (board report on HAL-10, 26 Nov: Submit on a card in Messenger sent nothing and said nothing)

When the person answers a card in a conversation, with one of its options or with **Submit**, the Messenger shall show the pressed button as busy until the answer lands or fails. When sending the answer fails, the card shall stay open with its controls available and say "Couldn't record your decision. Try again."; when the source refuses it, the card shall say why, as `messenger.quick-actions` words it. It shall never leave a press without a line on the card.

## Examples

- Given Chief's open card that asks several questions and an engine that fails the answer,
  when the board picks an option for each and presses Submit,
  then the card stays open, Submit is available again, and it says "Couldn't record your decision. Try again."
- Given Chief's open yes/no card and an engine that fails the answer,
  when the board presses Yes,
  then the card stays open and says "Couldn't record your decision. Try again."
- Given Chief's open card that asks several questions and a source that refuses the answer with `bad-answer`,
  when the board presses Submit,
  then the card says "This can't be sent here, so nothing was sent."
