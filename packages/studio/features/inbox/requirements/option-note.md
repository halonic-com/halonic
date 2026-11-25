# inbox.option-note

- Status: active
- Since: unreleased
- Source: HAL-18920, follow-up to HAL-18872 (approved by Liam on HAL-18872); wording of the Paperclip labels checked on HAL-18924

When an agent item's option takes a note, the Inbox card shall show a text field above the buttons, labelled with its `noteLabel`, or with the option's own label for a required note that has none, and that option's button shall send what was written as the answer's `note`. While a required note is empty, its button shall stay off and say why with the field's label; an optional note left empty shall send the option without one.

## Examples

- Given a Paperclip approval whose Request changes takes a required note "What should change?",
  when the card shows,
  then a field labelled "What should change?" shows and Request changes is off.
- Given that card,
  when the person writes "Lower the budget" and picks Request changes,
  then the answer sent is `{ kind: "option", option: "request-changes", note: "Lower the budget" }`.
