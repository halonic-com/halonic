# harness-host.proposal-service

- Status: active
- Since: unreleased
- Source: HAL-6477 (the `halonic proposals` flow, board yes on HAL-9332)

The host package shall build the run proposal service in one place, `runProposalsOf`, from the host's proposal parts, its digest and its clock, and `harnessHostOf` shall make the proposal folders on a service built there. A host that reviews proposals without running anything, as `halonic proposals` does, shall build its service there too, so it reads the same records and writes the same workspace files as the engine's.

## Examples

- Given a host's proposal records,
  when it builds the service with `runProposalsOf` and lists the proposals,
  then they are read from those records.
- Given proposal records that can't be listed,
  when the host lists the proposals,
  then it fails with the store's error.
