# kit.callout-done-label

- Status: active
- Since: unreleased
- Source: HAL-11626 (C446-1 of the design check on HAL-14656: Copy details in a Dialog confirms in place, as CommandBox does); microcopy 22 F13

Where a `Callout` action has a `doneLabel`, such as a Dialog's or FormSheet's `errorAction` **Copy details**, the kit shall show `doneLabel` in place of the action's label for 2 seconds once the promise its `onClick` returns settles with anything but `false`, and then its label again. Inside a Dialog or FormSheet, where toasts wait until it closes, it shall also say `doneLabel` through the modal's polite region. A promise that gives `false` keeps the label and says nothing. An action without a `doneLabel` keeps its label.

## Examples

- Given the Remove trust dialog with an internal error and the `errorAction` **Copy details** with `doneLabel` "Copied",
  when the person presses Copy details and the copy works,
  then the action reads "Copied", the dialog's polite region says "Copied", and 2 seconds later the action reads "Copy details" again.
- Given the same dialog,
  when the copy fails,
  then the action keeps reading "Copy details".
