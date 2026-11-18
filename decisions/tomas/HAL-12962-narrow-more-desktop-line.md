# Decision: More's last line in the desktop app, and the Workspace sheet's groups

- Approval: Decided by the designer on HAL-12962 (https://paperclip.halonic.com/HAL/issues/HAL-12962), rows S4 and S5 of the UX check on HAL-12952, a team decision on an approved screen (HAL-2282 rule). Liam signs on HAL-12962.
- Kind: user-visible

## What changes

More ends with "Editing workflows is easier in a wider window." in the desktop app, where More
shows only when the window is narrow or zoomed. On a phone (served Studio) it still reads
"Editing workflows is easier on a computer." The requirement `shell.more-page` says so in its last
sentence and gets a desktop example.

The kit's `HeaderBadgeSheet` keeps a Menu's groups: a heading shows as the kit's small section
label (12px capitals, muted) over its group, and a divider as an 8px gap before the next group. The
Workspace sheet of a narrow desktop window now reads RECENT, the workspaces, a gap, New workspace…
and Open a folder…, a gap, Workspace settings… and Close workspace. A sheet without headings or
dividers, such as the sample chip's, looks as before, danger rows last included. The requirement
`kit.header-badge-sheet-rows` says so and gets one example.

No test was weakened or skipped; tests were added for both.

## Why

Since #3737 More shows in the desktop app too, where the person is already on a computer, and its
Workspace sheet dropped the menu's "Recent" heading and dividers, so the workspaces ran straight
into the menu's commands in the same row style.

## Covers

- shell.more-page
- kit.header-badge-sheet-rows
