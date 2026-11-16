# source-control.share-address

- Status: active
- Since: 0.1.0
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.3; kit T9-F20; microcopy 16 and Sofia's wording on HAL-1566

While the folder has history but no remote, the Changes page shall show the sharing strip "Only on this computer" with Add where to share. Add where to share shall open a dialog with the sentence "Your team gets your versions from this git address, and you get theirs.", the field Git address with the hint "Copy it from the Clone button on GitHub, GitLab or your own git server.", Cancel and Add. Add shall stay pressable. An empty field, or an address that isn't `https://…`, `ssh://…` or `user@host:path`, shall say "Enter a git address, like https://github.com/acme/agents.git or git@github.com:acme/agents.git." under the field and reach git not at all. A valid address shall become the folder's remote `origin`, close the dialog, remove the strip and show Get updates. When git refuses, the dialog shall stay open with "Couldn't add this address." and the reason, and keep the address as typed. Cancel and Escape shall change nothing.

Not covered yet: the strip's other states (not shared, a teammate shared, up to date, couldn't check) and Share itself; the dialog does not check that the address can be reached (Sofia: only if Add did).

## Examples

- Given a repository with no remote,
  when the Changes page opens,
  then it says "Only on this computer" with Add where to share, and has no Get updates.
- Given the dialog is open and the person presses Add with nothing typed,
  then the field says "Enter a git address, like …" and nothing is added.
- Given the person types `git@github.com:acme/agents.git` and presses Add,
  then the address becomes the remote, the dialog closes and Get updates shows.
- Given the person types `/srv/agents.git`,
  then the field says "Enter a git address, like …".
- Given git refuses the address,
  then the dialog stays open with "Couldn't add this address." and the reason, and the address stays in the field.
