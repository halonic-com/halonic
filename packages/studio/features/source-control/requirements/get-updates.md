# source-control.get-updates

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.8; req-source-control (HAL-110) revision 4; microcopy revision 94, 16

While the folder has a remote, the Changes page shall show Get updates beside the heading. Get updates shall bring in the shared copy's newer versions only when this workspace has no version the shared copy lacks (a fast-forward), and shall say so with the toast "Got 2 versions from the shared copy" (one version: "Got 1 version from the shared copy"), or "Already up to date" when there was nothing newer. The button shall say "Getting updates…" and ignore presses while it works, and the page and the sidebar's count shall be read again afterwards. When the shared copy and this workspace both have new versions, or the shared copy can't be reached, or git refuses, nothing shall change and the danger toast shall say "Couldn't get versions" with the reason, "Nothing changed here." and Try again. A folder with no remote shall have no Get updates.

Choosing between the two sides per item (Keep mine, Use theirs, Keep both) is not part of this requirement; until it exists, both sides having moved only stops with the toast above.

## Examples

- Given the shared copy has 2 versions this workspace lacks,
  when the person presses Get updates,
  then the files are as the shared copy has them, the toast says "Got 2 versions from the shared copy", and the page reads again.
- Given the shared copy has nothing newer, then the toast says "Already up to date".
- Given both sides have new versions, then nothing changes and the toast says "Couldn't get versions", that both have new versions, "Nothing changed here." and Try again.
- Given the shared copy can't be reached, then the toast says "Couldn't get versions", "You can't reach the shared copy right now." and "Nothing changed here.".
- Given a folder with no remote, then the page has no Get updates.
