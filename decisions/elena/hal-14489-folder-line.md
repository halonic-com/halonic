# Decision: the workspace menu fits a narrow window, and the folder line's details from C399

- Task: HAL-14489
- Approval: team decision under the HAL-2282 rule for a detail of approved screens, no new words (Sofia as designer, rows WM1, MC3, RT1 and WN1 of her C399 check on HAL-14480); Liam reviews the pull request on HAL-14489 and signs this note
- Kind: user-visible

## What changes

- **WM1:** a kit `Menu` is never wider than the window less its 8px edge gap on each side
  (`max-w-[calc(100vw-1rem)]`). A menu item takes `detailCut: "middle"`, which cuts its detail with
  the shared `MiddleCut`; the workspace menu sets it on each Recent row, so its folder is cut in the
  middle like the switcher above it. `MiddleCut` moves from the shell into the kit for this, and the
  shell's switcher, Welcome's Recent and More import it from there.
- **MC3:** when a folder is cut, its end stops 2em short of the row (was 1.25em), so the start keeps
  its first letter and a whole "…". A folder that isn't cut has no start at all.
- **RT1:** on a phone, a sample's **Demo** tag on Welcome's Recent sits on the name's line, right
  after the name; on desktop it stays at the row's right. The row's name is unchanged.
- **WN1:** the sidebar's switcher and More's workspace row keep their names and are described by
  their whole folder (`aria-describedby` on the folder line), as a menu item's detail already is.

`kit.menu`, `kit.menu-groups`, `workspace.workspace-menu`, `shell.welcome-recent`,
`shell.welcome-sample` and `shell.more-page` say so and gain examples. One kit test expected the
menu's old class list and now includes the maximum width; no test was weakened or skipped. New
tests cover the middle-cut detail, the menu's maximum width, the 2em start and the missing start,
the tag on a phone and on desktop, and both descriptions; the e2e checks open the workspace menu
with a 101-character folder in a 640px window and measure the cut start in a 320px one.

## Why

Sofia's C399 check of #4018 found, at 200% (a 640px window) with a 101-character folder, the
workspace menu 749px wide and 117px past the window's edge, with Ctrl 1 and the open workspace's
check off-screen; a squeezed start that read `C..\`, like the parent folder; a Recent folder left
49px at 195px; and two workspace buttons that never said their folder to a screen reader.

## Covers

- kit.menu
- kit.menu-groups
- workspace.workspace-menu
- shell.welcome-recent
- shell.welcome-sample
- shell.more-page
