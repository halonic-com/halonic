# shell.home-copy-details

- Status: active
- Since: unreleased
- Source: HAL-11642 (states audit gap 4); microcopy 1.4 and 22 F13

If a Home section fails with an error Halonic can't explain, then its error shall offer **Copy details** after **Try again**, which puts the section's "Couldn't load" title and the error's own name, message and stack on the clipboard; the error's own message shall never show on screen. A section that fails with a reason Halonic can explain shall offer no Copy details.

## Examples

- Given Recent runs fails with an internal error "socket closed",
  when the user presses Copy details,
  then the clipboard holds "Couldn't load recent runs" and "socket closed", and the section still doesn't show "socket closed".
- Given Recent runs fails because Halonic on your computer isn't answering,
  when Home shows,
  then the section shows Try again and no Copy details.
