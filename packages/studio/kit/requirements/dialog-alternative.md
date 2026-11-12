# kit.dialog-alternative

- Status: active
- Since: 0.1.0
- Source: HAL-1291; UX checklist 1.3 ("Close Acme?": Keep open · Close anyway · Try again)

When a `Dialog` with a footer has an `alternative`, the kit shall draw it as a ghost button between Cancel and the confirming button, on a phone stacked between them too, and run its `onClick` when it is pressed. While the Dialog is `busy` it shall be unavailable, because the request is running and a second choice could clash with it, as with Cancel. A Dialog without an `alternative` has no such button.

## Examples

- Given a Dialog "Close Acme?" with Try again as its confirming button and the alternative "Close anyway",
  when it mounts,
  then the footer reads Cancel, Close anyway, Try again, and pressing Close anyway runs its `onClick` and not `onConfirm`.
- Given the same Dialog while it is busy,
  when someone presses Close anyway,
  then nothing happens.
