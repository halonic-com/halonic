# messenger.answer-elsewhere

- Status: active
- Since: unreleased
- Source: HAL-18861 (board ask on HAL-10: no dead cards in Inbox and Messenger); HAL-18871; wording by Nina on HAL-18923

When an open card in a chat carries `answerElsewhere`, the Messenger shall show the link "Answer in {source}", where `{source}` is the source's label ("Paperclip" when it has none), opening that address in the browser, and shall show no option buttons.

## Examples

- Given Chief's chat with an open card from "Paperclip · Acme" that can't be answered here,
  when the chat opens and the link is pressed,
  then the card shows "Answer in Paperclip · Acme" and no option buttons, and the task's page opens.
