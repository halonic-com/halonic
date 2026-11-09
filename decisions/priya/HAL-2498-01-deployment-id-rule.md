# Decision: a deployment id has at most 64 characters and isn't a Windows device name

- Requirement: `format.deployments-file` (`packages/core/format/requirements/deployments-file.md`)
- Task: HAL-2498, from the review of #685 on HAL-2370
- Approval: [HAL-2498](/HAL/issues/HAL-2498) asks for this change; the package owner (Elena) and Liam approve it in review
- Kind: user-visible

## What changes

`deployments.yaml` refuses two deployment ids it used to accept:

- an id over 64 characters;
- an id that Windows keeps for a device: `con`, `prn`, `aux`, `nul`, `com0`–`com9`, `lpt0`–`lpt9`.
  Names that only start like one (`console`, `com10`, `nul-1`) are still accepted.

A refused id reports `invalid_key` at that deployment, as before, but its message now says which
rule it breaks ("Not a deployment id: use at most 64 characters, …") instead of zod's bare
"Invalid key in record". This applies to every refused deployment id, so an id with capitals now
also says to use lowercase letters. The other kinds' keys keep the old message.

The JSON Schema spec file (`spec/deployments.schema.json`) gains `maxLength: 64` and the device
name pattern on the deployment keys. The other kinds' ids don't change.

## Why

Each deployment keeps its runs in a folder named after its id (`deployments/<id>/runs` in the
profile, #685). `@halonicjs/profile` refuses ids that can't be folder names on every system, so a
`deployments.yaml` with an `aux` deployment passed the format and then failed when its runs folder
was looked up. The format now refuses the same ids up front, with a message the person can act on.
64 characters, rather than the 128 the profile allowed, keeps the runs folder's path under Windows'
260-character limit; the profile moves to the same cap in the next pull request, with a test that
every id the format accepts gives a runs folder.

No parity fixture uses such an id, and the parity check compares problem codes and places, not
schema messages, so parity is unchanged.

## Tests

No test was weakened or removed. Tests were added for the 64-character limit, each device name,
names that only start like one, and the messages.

## Covers

- format.deployments-file
- packages/core/format/spec/deployments.schema.json
