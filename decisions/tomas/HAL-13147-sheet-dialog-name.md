# Decision: the narrow window's sheet dialogs are named once, by their title

- Approval: Liam's review of #3792 (HAL-12879), noted on HAL-13144 and split out as HAL-13147; Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VdszgVTcP4Bl6bczd/Rq0WZgXvmSUietKBdHo8RL5pVF8liMjq60Nwr4rkJax1ETKZpmegXa7mQnl4vav9TzAQ==
- Task: HAL-13147

## What changes

`kit.header-badge-sheet-dialog`: the `<dialog>` that holds a header badge's sheet (More's workspace menu and sample chip in a desktop window as narrow as a phone) was named by `aria-label`, and the `SidePanel` inside it was a `complementary` region with the same name. A screen reader read "Workspace" three times: dialog, region, heading. The dialog is now named by its title through `aria-labelledby`, as `Sheet` already is, and the panel inside draws no region, so the name is read once, then the heading.

`kit.side-panel`: a new `dialogTitleId` option. A panel given it puts that id on its title and draws a plain `<div>` instead of the `<aside>`. Without it, nothing changes.

One test assertion moved with the rule, not weakened:

- `narrow-window.test.tsx`, `workspace.narrow-window-sheet-focus`, "opens …'s sheet as a modal": it read the dialog's `aria-label`; it now reads the dialog's name from the element its `aria-labelledby` points to, and still expects the sheet's title. The kit's own test does the same and adds a test that the dialog has no `aria-label` and no region inside it.

## Why

A dialog is already a landmark-like container with a name. A second, same-named region inside it adds nothing but noise for screen-reader users, and `Sheet` already names its dialog from its title. Naming from the title also keeps the name and the visible heading the same if the title ever changes.

## Covers

- kit.header-badge-sheet-dialog
- kit.side-panel
- workspace.narrow-window-sheet-focus
