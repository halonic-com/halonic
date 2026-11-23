# shell.change-mark

- Status: active
- Since: unreleased
- Source: HAL-16805 (T14 PR 14a, HAL-1307); AI changes 1.2 and 1.7 (HAL-3228); T14 review panel note 3 (HAL-3820)

The shell's `ChangeMark` shall mark one of the assistant's changes in place on an item page, around the field or step it changed: an added one with a green (`success`) edge on its start side, a removed one with a red (`danger`) edge and its old value struck through in red, and a changed one with an `accent` edge and its old value struck through above the field as it is now. The mark shall be a group named by the change's sentence, focusable by code, carry the change's id so the page finds it with `changeMarkSelector`, show the sentence, start it with "Important" for an important change, and end with its own small **Accept** and **Reject**. Where the change is the only part of a file the assistant created, Reject shall read "Reject and delete file". While the decisions wait, as when the file changed outside Halonic, the mark shall show no Accept or Reject.

## Examples

- Given the agent's model changed from claude to gpt,
  when its mark renders,
  then it is a group named "Model: claude → gpt" with "claude" struck through, the field, Accept and Reject.
- Given a change marked important,
  when its mark renders,
  then "Important" comes before its sentence.
- Given a new agent the assistant created,
  when its only mark renders,
  then its buttons read Accept and "Reject and delete file".
- Given the marks on a page,
  when the page looks up `changeMarkSelector("field:model")`,
  then it finds the model's mark.
