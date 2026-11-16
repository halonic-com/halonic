# Decision: three small additions that the Try the sample card needs

- Approval: the Try the sample card is in the board-approved first-run flow (flow-first-run rev 15, HAL-663, section 3.3); Liam approved the T15 plan that builds it on HAL-10917
- Kind: internal

The Try the sample card (first-run.sample-card) needs three things from other packages, and each adds one sentence to a
requirement without changing what it already says:

- The shell lets a Home card give its own heading, so Get set up's slot reads "Try the sample" in the sample (shell.home-sections).
- The Inbox can be asked to show its request form with focus in Message, which is step 1 of the card (inbox.request).
- The runs list notes that a run's page was opened in this window, which is how step 3 knows (runs.run-page).

## Covers

- shell.home-sections
- inbox.request
- runs.run-page
