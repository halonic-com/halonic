# inbox.answer-elsewhere

- Status: active
- Since: unreleased
- Source: HAL-18861 (board ask on HAL-10: no dead cards in Inbox and Messenger); HAL-18871; wording by Nina on HAL-18923

When an open agent item carries `answerElsewhere`, the Inbox card shall show the link "Answer in {source}", where `{source}` is the source's label ("Paperclip" when it has none), opening that address in the browser, and shall show no option buttons and no reply field.

## Examples

- Given an open item from "Paperclip · Acme" whose source can't take an answer here,
  when its card opens,
  then it shows the link "Answer in Paperclip · Acme" to the task's page, and no Send answer field.
