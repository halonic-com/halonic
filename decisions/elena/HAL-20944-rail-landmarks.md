# Decision: a rail entry picked with no page is `aria-current="true"`, not `"page"`

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20944 (the accessibility check of #6906; Nora's review of #6912 asked for this note). Liam approves the change in review on HAL-20944.
- Kind: user-visible
- Signature:

## What changes

`shell.rail`: the selected entry stays `aria-current="page"` while it holds the active tab's page; an entry picked that opened no page, such as Messenger, is `aria-current="true"` (`shell.rail-current`). The rail's name "Apps" comes from #6913 (HAL-20676), which this pull request is stacked on.

`kit.rail-button`: the selected button is `aria-current="page"`, or `aria-current="true"` when it is given the new optional `current="true"`, with the same look. A new example covers it.

Tests changed to follow:
- `apps/studio/src/studio/start-studio.places.test.ts`: after a rail click it waits for any `aria-current`, not `"page"`, because Messenger opens no page. It is only the sign that the pick took; `shell.rail-current`'s tests check the value.
- `packages/studio/shell/src/rail/window-rail.test.tsx`: the `shell.rail-frame` tests' "selected" helper reads any `aria-current`; a new `pages()` helper checks `"page"` where the entry holds the page (Inbox after its click, Home at the start).

New tests: the window names no two `nav`s alike, a picked Messenger is `"true"` with no entry `"page"`, and the kit's `current="true"`. No test was skipped or weakened.

## Why

A screen reader announced the picked Messenger as the current page while the page and the sidebar still showed Home.

## Covers

- shell.rail
- kit.rail-button
