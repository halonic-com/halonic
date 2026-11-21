# Decision: the sandbox guide link named for the reason, and the alias's tab for a missing model

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11626 (row R9 of the UX check on HAL-11613, against microcopy 23.3; RQ1 of Sofia's C430 check on HAL-14597, decided by the team with Sofia; Liam approves this note in review)
- Kind: user-visible

Four requirements change to match the approved words:

- `runs.run-view.sandbox-not-ready` and `runs.sandbox-cant-run`: the guide link is named for the reason, with `docsName` from `sandboxStartWords` ("How to install bubblewrap"; "What the sandbox needs" for a reason with no section of its own), instead of "Read the guide" for every reason (R9). Microcopy 23.3 approves "Read the guide" only for the Inbox card, which keeps it.
- `routines.page.cant-run`: its example names the link "How to install bubblewrap", as it shows the Callout of `runs.sandbox-cant-run`.
- `runs.run-view.failure-banners`: for `model-missing`, **Open Models** opens the alias's tab when the log names the alias, as it already does for `model-no-tools`, because its sentence says "pick another model in Models" and that is done on the alias's tab (RQ1). `model-unreachable` keeps the workspace page, because its fix is the provider's address.

The workflow page's test of `workflows.page.cant-run` now expects the reason's link name; that requirement's text doesn't name the link and is unchanged. No other sentence changes, and no test was weakened: the tests gain cases for the link names and the alias's tab.

## Covers

- runs.run-view.sandbox-not-ready
- runs.sandbox-cant-run
- routines.page.cant-run
- runs.run-view.failure-banners
- workflows.page.cant-run
