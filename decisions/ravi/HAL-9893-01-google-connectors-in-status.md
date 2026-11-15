# Decision: the Library lists Google connectors, with the state of their setup record

- Approval: Paperclip task HAL-9893 (the follow-up Liam set up on HAL-9773; the way to build it is his decision on HAL-9902)
- Kind: user-visible

The requirement `studio.workspace-connector-status` said the desktop app leaves Google connectors out
of the Library's connector status, because the app could not read their sign-in yet. It can now: the
setup block already reads each Google account's setup record. The requirement changes in three ways:

- A Google connector is listed, and its state is read from its account's setup record, the same one
  the Google setup block shows, so the Library and the block agree. With no record it is not connected.
- The status tells its listeners when a Google account's setup changes, so the Library never shows an
  older state than the block (Liam's review of the pull request).
- The "does not list it" example is replaced by two examples for the listed states.

Nothing else is removed or weakened: the examples and tests for the other connectors and for refusals
stay as they were. The test that named the old behaviour now names the new one.

## Covers

- studio.workspace-connector-status
