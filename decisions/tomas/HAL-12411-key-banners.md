# Decision: run page banners for keys, a busy provider, no credit, a cloud model and local only

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12411 (UX check R1 to R6 on HAL-12390, microcopy 15.3 and revision 113 of 1.6 on HAL-751; small wording on an approved screen, a team decision under HAL-2282); facts shared with the CLI approved by Liam on HAL-12464
- Kind: user-visible
- Task: HAL-12411

A run that failed with `key-refused`, `provider-busy`, `out-of-credit`, `local-only`, or
`model-missing` at a cloud provider showed "Halonic can't tell the cause yet". The new
requirement `runs.run-view.account-banners` gives each its banner, from the same facts as the
CLI's failure lines (`@halonicjs/app/run-failure`). Two active requirements change with it:

- `runs.run-view.failure-banners` said a cloud provider's `model-missing` keeps the general
  banner. It now says that provider gets the banner of `runs.run-view.account-banners` (UX check R5).
- `studio.workspace-runs` adds that the app gives each hub's model aliases, the provider files
  and their addresses, which the banners read their facts from.
- `runs.run-view.slow-step-line` (the step's line and the waiting line) named a model provider by
  its known name, else its id with a capital ("Claude"). It now names it as the banners do, with `providerNameOf`: the file's `name`, else the
  known name, else the id as written (UX check R8). One rule for both, as Liam asked on HAL-12411;
  `providerName()` leaves `failure-words.ts`. The slow-step tests now call the provider
  `anthropic`, a known id, so their line still has a capital.

The new banners follow 15.3's order as HAL-11626 set it for the others: **Open *OpenAI* billing**
is a link after **Run again**, and a cloud provider's **Open Models** opens the alias's tab.

No test is removed or weakened. The test "keeps the general banner for a cloud provider's
missing model" still passes unchanged: its page has no workspace models, so it keeps the general
banner, as the new requirement says.

## Covers

- runs.run-view.failure-banners
- runs.run-view.slow-step-line
- studio.workspace-runs
