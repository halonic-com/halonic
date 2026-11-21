# Decision: the trust check lists a pick under its own name before the renamed ones

- Task: HAL-15412
- Approval: the reviewer approves this note in their review of this pull request on HAL-15412. A team decision with no board card (HAL-2282 rule): Mara's words as the designer, from her design check C569 on HAL-15385, no new wording.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jkIEAxPZx6ywT+c/u5OONc/DTId72uzVfe/A0QqyW6SADcIwUVtrC1B5FuL5UFgQzyPxS8CDjVAjZrHi7LB1AQ==

## What changes

A local integration's connector `notes` gives the sheet's secret notes-key the workspace secret
my-notes-key and the sheet's secret sync-key the workspace secret sync-key. The trust check in
the CLI (`halonic` and `halonic trust`) and Studio's trust dialog listed the picks by the
sheet's name: "my-notes-key as notes-key and sync-key". "X as A and B" reads as X passed under
both names, the misreading C552 wanted gone. Both now list the picks whose workspace secret has
the sheet's name first, then the renamed ones, each group in the order it had: "sync-key and
my-notes-key as notes-key"; with three, "sync-key, backup as api-key and my-notes-key as
notes-key".

`cli.trust-check` says the same-named picks come first and its example gets the new order;
`studio.workspace-trust-review` says it lists them as the CLI does and its example gets the new
order. The two existing tests' expected lines change to the new order.

No requirement was retired, and no test was weakened or skipped.

## Why

The "and" from HAL-15261 is right; only the order made "as" read as a second name. With the
renamed picks last, every "as" sits next to the one secret it renames.

## Covers

- cli.trust-check
- studio.workspace-trust-review
