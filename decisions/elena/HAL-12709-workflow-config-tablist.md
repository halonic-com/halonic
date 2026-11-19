# Decision: the workflow's Configuration list uses the kit's vertical TabList, so its own key helper and its test go

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12709 (the follow-up Liam filed from HAL-12704; a team decision with no board card, HAL-2282 rule)
- Kind: internal
- Task: HAL-12709

## What changes

A workflow's Configuration drew its own `role="tablist"` with its own key handler, `pageForKey` in
`configuration-pages.ts`. It now uses the kit's `TabList` with `orientation="vertical"` and its
`TabPanel`, as the agent's Configuration does. The kit owns the keys now (↑ and ↓ wrapping round,
Home and End, one Tab stop), so `pageForKey` is gone and so is its unit test,
`configuration-pages.test.ts`.

No check is lost. The deleted file's checks (↓ and ↑ wrap round, Home and End jump, other keys do
nothing) run in the kit's own `tabs-vertical.test.tsx`, and `configuration-page.test.tsx` gains
tests that run them on the real page: ↑ from General wraps to Problems and ↓ back, End and Home
jump, focus follows the picked page, the list keeps one Tab stop, and the Problems count is read as
"1 error". `workflows.configuration.pages` runs more tests and more `expect` calls than before.

The one visible change is the kit's row hover: an unpicked page's row now gets the `surface-subtle`
fill on hover, as in the agent's list, where before only its text changed.

## Covers

- packages/studio/features/workflows/src/configuration/configuration-pages.test.ts
