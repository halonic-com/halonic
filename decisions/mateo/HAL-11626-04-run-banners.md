# Decision: the run banners' button order, the alias's tab, Copy details and the agent's name

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11626 (rows R3, R4, R8 and R10 of the UX check on HAL-11613, against microcopy 15.3 and 22 F6 and F21; Liam approves this note in review)
- Kind: user-visible

Three run-page requirements change to match the approved words:

- `runs.run-view.failure-banners`: for a local model that can't be reached or isn't downloaded, **Run again** comes before **Open Models** (R3). For "no tools", **Open Models** opens the alias's tab (R4). The sandbox-didn't-start banner gets **Copy details** (R8), so the "no Copy details yet" limit goes. The agent is named as its file names it (R10).
- `runs.run-view.harness-banner`: **Copy details** after **Run again** (R8, F21), and the agent by its name (R10). The "no Copy details yet" limit goes.
- `runs.run-view.sandbox-not-ready`: the agent by its name (R10).

No other sentence changes, and no test was weakened: the tests gain cases for the new order, the tab, Copy details and the agent's name.

## Covers

- runs.run-view.failure-banners
- runs.run-view.harness-banner
- runs.run-view.sandbox-not-ready
