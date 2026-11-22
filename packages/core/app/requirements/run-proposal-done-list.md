# app.run-proposal-done-list

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, row Q10 of HAL-11945: the Done heading, kept 30 days); `app.run-proposal-done`

The proposal service shall list the proposals of the workspace's runs that were settled in the last 30 days, the one settled last first, with their decisions, so the Inbox can show them under Done. An open proposal, one settled 30 days ago or more, and a record that can't be read shall not be listed.

## Examples

- Given the person rejected every file of run `01JD8Q` and its proposal was settled, and run `7KQ2MX` was settled an hour later,
  when the host lists what is done,
  then it gets `7KQ2MX`, then `01JD8Q`, each with its decisions.
- Given run `01JD8Q` was settled 31 days ago,
  when the host lists what is done,
  then the list is empty.
- Given run `01JD8Q` has an open proposal,
  when the host lists what is done,
  then the list is empty.
