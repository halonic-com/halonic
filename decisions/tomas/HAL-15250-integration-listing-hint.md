# Decision: an integration that can't list its tools points to halonic doctor

- Approval: Liam approves this change on HAL-15250 (https://paperclip.halonic.com/HAL/issues/HAL-15250), follow-up to HAL-14784. Wording decided by the team on HAL-15259 (option 1), Sofia's check didn't happen. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gYuDOhGAWrr5lS18NXqK2ef4bd4vfxad7AbmrPm5GLxAO+fegeRrdPYnUQAVyqT4eqY602GbxyE4ktMd2ttUAw==

## What changes

When a run's connector couldn't list its tools for a cause the log doesn't name (`why: "other"`),
`halonic run` warned "… couldn't list its tools …" with "To see why, run halonic tools review
<connector>". For a local integration's connector (`transport: { integration }`) that command starts
nothing since HAL-14784 and only says its tools need no approval, so the hint led nowhere. For such a
connector the second line is now "Its integration needs the sandbox and a trusted workspace to start.
To check both, run halonic doctor" (with the user's `--dir`). Every other connector keeps the
`tools review` line.

The requirement `cli.run-connector-warning` says this and gets one more example. The warning's tests
take the connectors' files and kinds as one object now; no test was removed or weakened, and one test
is added for the integration line, one for telling an integration's connector apart.

## Why

The run log keeps no error text (`connector.listing-failed` has only `why: "other"`), so the CLI can't
say the exact reason. An integration's runner starts only with the sandbox (or a yes to run without it)
and a trusted workspace, and `halonic doctor` checks both.

## Covers

- cli.run-connector-warning
