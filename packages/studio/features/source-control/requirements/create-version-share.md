# source-control.create-version-share

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.6; req-source-control (HAL-110) SC 3 and 4; microcopy 16

While the folder has a share address, Create version on the desktop shall offer the box "Share with your team right away" under What's in it, with the caption "Your team can get it straight away. Sharing can't be taken back, but you can share a newer version.". The box shall start as the person last left it in this workspace, and off the first time. When the folder has no share address, or on a phone, the box shall not show. When the person creates a version with the box ticked, the source control feature shall create the version, then share it, and show one toast `Created and shared version "<name>"`. When sharing fails, the version shall stay created, and the toast "Couldn't share" shall give the reason and "Your version is saved here." with Try again, and stay until closed. Try again shall share again and speak as the sharing strip does. Git's own output shall never be shown.

Not covered yet: the tests line.

## Examples

- Given a share address is set and the box was never ticked in this workspace,
  when the person opens Create version,
  then the box is off and its caption shows.
- Given the folder has no share address,
  when the person opens Create version,
  then the box doesn't show.
- Given the person ticked the box last time,
  when they open Create version again,
  then the box is ticked.
- Given the box is ticked,
  when the person creates "Changes to README.md",
  then the version is created and shared, and the toast reads `Created and shared version "Changes to README.md"`.
- Given the box is ticked and the shared copy can't be reached,
  when the person creates the version,
  then the version is created, and the toast "Couldn't share" says "You can't reach the shared copy right now. Your version is saved here." with Try again.
