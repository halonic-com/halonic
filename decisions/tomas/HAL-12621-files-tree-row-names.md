# Decision: a Files tree file row is named by its name alone

- Task: HAL-12621 (keyboard and screen-reader check HAL-12584, row F1)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12621 (fix placed by Liam; team decision under HAL-2282, no new words)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:o2tbtj4ziudOi3uqYEhiSQ/Be8KtN/U/uM0g2LeJjLfn5WcC2ItczNHNZaZHX6qFSaogiqxZtNVnnNFpck2GCQ==

## What changes

The existing requirement `files.ui.tree-view` grows by one clause and one example: a file row is
named by its full name alone and not with its ⋮ button, so a screen reader reads "models.yaml" and
not "models.yaml More actions for models.yaml". The ⋮ button keeps its own name, "More actions for
models.yaml". Folder rows and a row being renamed are named as before. HAL-12621 is added to the
requirement's sources.

Nothing is removed from the behaviour; no example or test is weakened or deleted.

## Why

The ⋮ button sits inside the `treeitem`, so its label joined the row's name and a screen reader said
"More actions for …" on every file while moving through the tree (WCAG 4.1.2, 2.4.6). The row takes
its full name as `aria-label` rather than `aria-labelledby` on the name's `span`, because that span
shows a long name cut in the middle, and the row must be named by the full name.

## Covers

- files.ui.tree-view
