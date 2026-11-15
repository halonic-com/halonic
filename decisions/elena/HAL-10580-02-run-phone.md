# Decision: the phone shows the run page, not a sentence

- Task: HAL-10580
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-9387 (Liam's call: the phone layout comes after 0.1.0, and 0.1.0 is tagged); the layout is checklist 1.15 (HAL-1360, revision 10), already approved; Liam signs this note
- Kind: user-visible

## What changes

`runs.run-page` loses the paragraph "On a phone, the run page shall show only the sentence 'Runs open on your computer for now.'" and gains one that describes the phone layout of checklist 1.15: one column, the heading for screen readers, Details as one row that opens a sheet, a step's events as a screen of their own with Back.

The test "shows only the sentence on a phone, for a run opened from Home" and the shared `RunsOnComputer` component with its test (`runs-on-computer.test.tsx`) are removed: nothing shows the sentence any more. Tests of the phone layout replace them.

## Why

HAL-9387 put the phone layout after 0.1.0, which is now tagged. The header's ⋮, the 48px link rows and Show each call need parts the desktop page doesn't have yet (Run again, an open-workflow action) and come later.

## Covers

- runs.run-page
- packages/studio/features/runs/src/ui/runs-on-computer.test.tsx
