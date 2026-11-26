# inbox.option-note

- Status: active
- Since: unreleased
- Source: HAL-18920, follow-up to HAL-18872 (approved by Liam on HAL-18872); wording of the Paperclip labels checked on HAL-18924; shown only once pressed, from the visual check on HAL-19016 (HAL-19020)

When an agent item's option takes a note, the Inbox card shall show no field for it until that option's button is pressed; pressing it shall replace the buttons with a focused text field, labelled with its `noteLabel` or, for a required note that has none, with the option's own label, and under it that option's button, which sends what was written as the answer's `note`, and **Cancel**. Cancel or Escape shall bring the buttons back and send nothing. While a required note is empty, its button shall stay off and say why with the field's label; an optional note left empty shall send the option without one.

## Examples

- Given a Paperclip approval whose Request changes takes a required note "What should change?",
  when the card shows,
  then it shows no text field, only Approve, Reject and Request changes.
- Given that card,
  when the person presses Request changes,
  then a field labelled "What should change?" shows with the focus, and Request changes under it is off.
- Given that field,
  when the person presses Cancel,
  then the field goes, the three buttons come back and nothing is sent.
- Given that field,
  when the person writes "Lower the budget" and presses Request changes,
  then the answer sent is `{ kind: "option", option: "request-changes", note: "Lower the budget" }`.
