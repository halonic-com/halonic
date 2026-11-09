# kit.button-unavailable

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 1 (revision 21) and 23 A1, L1

The kit's `Button` shall have no `disabled` prop. While a `Button` is given `unavailable={{ reason }}`, the kit shall render it with `aria-disabled="true"` and `aria-describedby` set to `reason`, keep it in the Tab order, and ignore its clicks, including the submit of its form. While a `Button` is `busy`, the kit shall show the spinner in place of its icon, set `aria-busy="true"`, ignore its clicks, and never set `disabled`. When a `Button` has a `busyLabel`, the kit shall render its resting copy (icon and label) and its busy copy (spinner and `busyLabel`) on top of each other in one grid cell, the one not in use `invisible`, so the button keeps the width of the wider copy before, during and after `busy`.

## Examples

- Given `<Button unavailable={{ reason: "why" }} onClick={run}>Run now</Button>` and a text with id `why`,
  when the user clicks it,
  then `run` isn't called, the button isn't `disabled`, and it is described by the text with id `why`.
- Given a `busy` submit button in a form,
  when the user clicks it,
  then the form isn't submitted and the button keeps `aria-busy="true"` and focus.
- Given `<Button busy busyLabel="Creating…">Create</Button>`,
  when it renders,
  then the busy copy reads "Creating…" and the resting copy "Create" is `invisible` in the same grid cell.
