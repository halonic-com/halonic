# Decision: a rail entry picked with no page is `aria-current="true"`, not `"page"`

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20944 (the accessibility check of #6906; Nora's review of #6912 asked for this note). Liam approves the change in review on HAL-20944.
- Kind: user-visible
- Signature:

## What changes

`shell.rail`: the selected entry stays `aria-current="page"` while it holds the active tab's page; an entry picked that opened no page, such as Messenger, is `aria-current="true"` (`shell.rail-current`). The rail's name "Apps" comes from #6913 (HAL-20676), which this pull request is stacked on.

`kit.rail-button`: the selected button is `aria-current="page"`, or `aria-current="true"` when it is given the new optional `current="true"`, with the same look. A new example covers it.

Two tests are loosened on purpose, because a selected entry can now be `"true"` as well as `"page"`:
- `apps/studio/src/studio/start-studio.places.test.ts`: after a rail click it waits for any `aria-current`, not `"page"`, because Messenger opens no page. There it only shows that the pick took; `shell.rail-current`'s tests check the value.
- `packages/studio/shell/src/rail/window-rail.test.tsx`: the `shell.rail-frame` tests' "selected" helper reads any `aria-current`, so those tests no longer check `"page"` on each selected entry. A new `pages()` helper puts `"page"` back where the entry holds the page: Home at the start and Inbox after its click.

The click test's `affected.test.ts` adds `rail-current` to the steps a Messenger-only change runs, since the new step names `messenger.rail-entry`; nothing is taken out of the list.

`rail-dot.tsx` finds the selected button by any `aria-current`, so the white dot (`shell.rail-dot`) still moves to a picked Messenger.

New tests: the window names no two `nav`s alike; a picked Messenger is `"true"` with no entry `"page"`; the kit's `current="true"`; the white dot travels to a picked Messenger; and the click test's new `rail-current` step (`studio-click-test.rail-current-step`) checks the landmarks and the pick in the installed app. No test was skipped.

## Why

A screen reader announced the picked Messenger as the current page while the page and the sidebar still showed Home.

## Covers

- shell.rail
- kit.rail-button
