# Decision: Runs says "isn't answering" only when the host can't reach the engine

- Approval: HAL-11641 (states audit gap 3, from Sofia's audit on HAL-11635). Liam wrote this pull request, so Julian approves the note in review.
- Kind: user-visible

`runs.list` said that a failed load shows "The engine isn't answering. It may still be starting." and that a later failed load keeps the rows under "The engine isn't answering. Showing what it said last.". The list reads the workspace's files, so most failures have nothing to do with the engine, and a phone or a served Studio doesn't call it "the engine".

The requirement now says: only a host that says the engine can't be reached gets "isn't answering", in that host's words; any other failure gives its own reason, or "Halonic ran into a problem it can't explain yet." with Copy details (microcopy F13), and a later failure keeps the rows under "Couldn't refresh runs." and the reason. The scenario for the first failed load changes to match, and a scenario for the phone's words is added.

## Covers

- runs.list
