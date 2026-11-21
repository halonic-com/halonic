# Decision: a Help item can carry a line under its label, wrapped, in the menu and on the phone

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14977 (the board's decision C520-9: Help stays the menu, and each First run item gets the line from Noah's drawn sheet); built on https://paperclip.halonic.com/HAL/issues/HAL-15164
- Kind: user-visible

Help › First run's **Show the guide** and **Start over** each get a line under the label, as Noah's sheet draws
them. Start over's says "Copies Acme to a new folder and begins again at the first step. Your old copy stays
where it is." That sentence is too long for one line, so cutting it with "…" would hide the part that matters.
Three requirements grow to allow it, and nothing they already asked for changes:

- `kit.menu-groups`: a menu item's `detail` takes a third cut, `detailCut: "wrap"`, which wraps the line onto
  more lines, at most 300px wide, instead of cutting it. One new example.
- `shell.help-menu`: a Help item's description, when it has one, shows wrapped under its label and describes
  it. One new example.
- `shell.phone-help`: the phone's More page shows that description under the item. One new example.

No test is weakened or removed: each requirement keeps its tests and gets a new one for the line.

## Covers

- kit.menu-groups
- shell.help-menu
- shell.phone-help
