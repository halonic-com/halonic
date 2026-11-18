# plugins.plugin-built-in

- Status: active
- Since: unreleased
- Source: HAL-1740; decided by the team on HAL-12111 (design section 9, CHECK P5)

Settings → Plugins shall list one built-in row, **Gmail and Google Drive**, with "Comes with Halonic" and the chip Built in, whichever workspace is open and however many accounts are connected. Its ⋮ menu shall have only **Open**, which closes Settings and opens Library › Connectors. It shall have no trust check and no plugin page.

## Examples

- Given Settings → Plugins, then a row "Gmail and Google Drive" with the chip Built in is listed under Built in.
- Given that row, when the person opens it, then Settings closes and the command `library.connectors` runs.
- Given a context that can't run commands, then the row has no ⋮ and opens nothing.
