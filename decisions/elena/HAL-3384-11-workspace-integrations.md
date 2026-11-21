# Decision: a local integration moves out of Addresses into its own Integrations section

- Task: HAL-3384 part 6, followed to merge on HAL-15321
- Approval: Liam approved this PR's Integrations section on `29dd21a3` (HAL-3384); the rebase onto HAL-15261 is a team decision on HAL-15321; Liam signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ksRz3XtbZtpJUiyF4MXcVYI7BNBJpJmMZXRKYV4ZTvNLzJpiVZI1I/gn5hqPlxws2lx8k2GTrsNlHPXSVj8XAg==

## What changes

`studio.workspace-trust-review` had gained a sentence from HAL-15261 (#4570): a local integration has a row of its own
under Addresses only when its sheet reads an address from a setting. This PR lists every local integration in its own
Integrations section (`studio.workspace-trust-integrations`) instead, so that sentence now says a local integration is
listed in its own section and never under Addresses, and under Addresses it is listed once, by its connector, which
is what HAL-15261 asked for. The last example drops its summary sentence, because the count depends on details the
example doesn't give; the Addresses count and the `Gets secrets` line stay.

No test was weakened or skipped. HAL-15261's test still checks that the connector is listed once under Addresses, and
now also expects the Integrations section above it.

## Covers

- studio.workspace-trust-review
