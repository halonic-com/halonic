# workspace.failed-open-leaves-no-slot

- Status: active
- Since: 0.1.0
- Source: req-workspace `workspace.switcher.failed-open-leaves-no-slot` (HAL-110), flow-workspace 2.2, microcopy 3.2; HAL-1291

If the folder picker is cancelled, then the workspace switcher shall change nothing and say nothing. If a folder fails to open, then the switcher shall add no slot for it and not remember it, and shall say "Can't open *folder*: *reason*": under the Welcome screen's text when no workspace is shown, else in an error toast over the workspace that is shown.

## Examples

- Given "acme" is shown,
  when the user picks **Open a folder…** and cancels the picker,
  then only "acme" is open and no message shows.
- Given "acme" is shown,
  when opening `/missing` fails with "No folder /missing",
  then only "acme" is open and the error toast reads "Can't open /missing: No folder /missing."
