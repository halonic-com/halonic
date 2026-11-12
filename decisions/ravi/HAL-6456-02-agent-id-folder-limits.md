# Decision: an agent id has at most 64 characters and isn't a Windows device name

- Requirement: `format.agent-file` (`packages/core/format/requirements/agent-file.md`)
- Task: HAL-6456, from Liam's review of #1957 on HAL-6441
- Approval: Liam decided on [HAL-6456](/HAL/issues/HAL-6456) to fix this in the format, not in each caller, and approved the change there in review as package owner
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0DK5m/7wMOk8uMSkaZaRHYAXlEi2g104cr8W7AiKQze4xwhToDtbuIJP0Kvpi0YSptVd1ry1oe9Si4ODGO3CCQ==

## What changes

An agent file refuses two agent ids it used to accept, the same two that `deployments.yaml`
refuses for deployment ids:

- an id over 64 characters;
- an id that Windows keeps for a device: `con`, `prn`, `aux`, `nul`, `com0`–`com9`, `lpt0`–`lpt9`.
  Names that only start like one (`console`, `com10`, `nul-1`) are still accepted.

An id over 64 characters reports `too_big` at `id` ("use at most 64 characters, so the agent's
folder fits in a Windows path"), and a device name reports `invalid_format` at `id` ("use a name
Windows doesn't keep for a device (…)"). Agent ids that were valid before keep their old problems
and messages.

The format keeps one rule for ids that name a folder, and deployment ids and agent ids both use it.
Deployment ids keep exactly the rule and messages they had.

The JSON Schema spec file (`spec/agent.schema.json`) gains `maxLength: 64` and the device name
pattern on `id`, as `spec/deployments.schema.json` has on its keys. Method ids and the other
kinds' ids don't change.

## Why

#1957 gave each agent a harness settings folder named after its id
(`harness-settings/<agentId>/<harnessId>` in the profile). `@halonicjs/profile` refuses ids that
can't be folder names on every system, so an agent file with an `aux` agent, or an id of 65
characters, passed the format and then made doctor's sign-in or the Studio throw a `RangeError`
when the folder was looked up. The format now refuses the same ids when the workspace loads, with
a message the person can act on. This lands before any caller of `harnessSettingsFolder`
(HAL-5649, HAL-5395, HAL-6209), so no released workspace depends on the old rule.

No file in the repo, parity fixture or example uses such an agent id, and the parity check
compares problem codes and places, not schema messages, so parity is unchanged.

## Tests

No test was weakened or removed. Tests were added for the 64-character limit, each device name,
names that only start like one, and the messages. A new format test checks that agent files and
the profile's harness settings folder accept the same ids, as `runs-folder.test.ts` does for
deployment ids. The profile's harness settings folder test gains `a/b`, `a\b`, `c:` and `c:writer`
as refused ids and a 64-character id as accepted.

## Covers

- format.agent-file
- profile.harness-settings-folder
- packages/core/format/spec/agent.schema.json
