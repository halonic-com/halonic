# Decision: a run the key-address check stopped names the cause and the fix

- Task: HAL-15333 (follow-up to HAL-11873, from Iris's flow check C561 on HAL-15313)
- Approval: HAL-15333 asks for this change; Liam approves this note in review
- Kind: user-visible

## What changes

Three active requirements get more, and nothing they promised before is taken away:

- `app.run-failure`: an `error` whose cause is `models.key-origin-not-allowed`,
  `models.untrusted-provider-address` or `models.untrusted-workspace`, with the names it needs,
  becomes a failure with its own facts (`key-address-not-allowed`, `key-address-not-trusted`,
  `workspace-not-trusted`), and counts as setup.
- `cli.run-failure`: the CLI words those facts with the model check's own sentences. Line 2 is
  `halonic models allow-address "<key>" <address>`, or `halonic trust`, instead of a bug report.
- `cli.workspace-provider-key-trust`: `untrusted-provider-address` and `untrusted-workspace` give
  their provider (and address) as the cause's detail, as `key-origin-not-allowed` already did.
  `key-origin-not-allowed` is described as it already behaves: it names the key's name, never its
  value, and its fix no longer says "open Models in Halonic Studio".

## Why

A new user whose key's list didn't allow the provider's address was told "Halonic can't tell the
cause yet" and asked to file a bug, while the one-line fix existed. Studio can't write an allowed
address yet, and its keychain keys aren't the CLI's profile keys, so the fix sends no one there
until HAL-15128 ships.

## Covers

- app.run-failure
- cli.run-failure
- cli.workspace-provider-key-trust
