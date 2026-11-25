# kit.dialog-start-link

- Status: active
- Since: unreleased
- Source: HAL-18325; flow-workflows 2.2 (New workflow: "Describe it to the Assistant instead ›" at the start of the footer, across from Cancel and Create)

When a `Dialog` with a footer has a `startLink`, the kit shall draw it as a text link in the kit's standalone link style at the start of the footer, before Cancel and the confirming button, which keep the end, and on a phone after them, and run its `onClick` when it is pressed. While the Dialog is `busy` it shall do nothing, as Cancel does. A Dialog without a `startLink` has no such link.

## Examples

- Given a Dialog "New workflow" with Create as its confirming button and the start link "Describe it to the Assistant instead ›",
  when it mounts,
  then the footer reads the link, Cancel, Create, and pressing the link runs its `onClick` and not `onConfirm`.
- Given the same Dialog while it is busy,
  when someone presses the link,
  then nothing happens.
