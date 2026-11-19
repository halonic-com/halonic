# app.run-proposal-list

- Status: active
- Since: unreleased
- Source: HAL-6477 (the `halonic proposals` flow, board yes on HAL-9332)

The proposal service shall list the open proposals of the workspace's runs, newest first by when the run finished, so a host can show them without reading the run log. A settled proposal, and a record that can't be read, shall not be listed.

## Examples

- Given run `01JD8Q` finished at 09:00 and run `7KQ2MX` at 10:00, both with proposals,
  when the host lists them,
  then it gets `7KQ2MX`, then `01JD8Q`.
- Given the person rejected every file of run `01JD8Q` and its proposal was settled,
  when the host lists the proposals,
  then `01JD8Q` isn't listed.
- Given runs `01JD8Q` and `7KQ2MX` with proposals, and the record of `7KQ2MX` can't be read,
  when the host lists the proposals,
  then it gets `01JD8Q` only, and `7KQ2MX` waits for a read of it to say what is wrong.
- Given a run that changed nothing,
  when the host lists the proposals,
  then the list is empty.
