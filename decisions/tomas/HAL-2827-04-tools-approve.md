# Decision: `halonic tools approve` golden files for the HAL-2827 fix

- Approval: Liam approves this note in review on HAL-8296
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:uSAY3HcAS8uXBhH40J3eHUsMRDtIPJl5SqFJwCOVjoRihE0EVS9i6jlo1tru4kpJLO0YHGK+bEcc/50l1VhTCQ==
- Task: HAL-2827

## What changes

- `halonic tools approve` is fixed (HAL-2827). `--all` says it approved nothing when every waiting
  tool keeps changing.
- Eleven golden files are added under `apps/cli/src/commands/tools/golden/`. They record the CLI
  output of `approve` and of the usage errors, so the wording is reviewed with the code.

## Tests

No test was weakened and no existing golden file was changed or deleted. Every golden file below is
new and is read by the `approve` tests.

## Covers

- apps/cli/src/commands/tools/golden/approve-all-keep-changing.txt
- apps/cli/src/commands/tools/golden/approve-all.txt
- apps/cli/src/commands/tools/golden/approve-already.txt
- apps/cli/src/commands/tools/golden/approve-changed.txt
- apps/cli/src/commands/tools/golden/approve-not-listed.txt
- apps/cli/src/commands/tools/golden/approve-one.txt
- apps/cli/src/commands/tools/golden/approve-refused.txt
- apps/cli/src/commands/tools/golden/unreadable.txt
- apps/cli/src/commands/tools/golden/usage-fingerprint-all.txt
- apps/cli/src/commands/tools/golden/usage-fingerprint-many.txt
- apps/cli/src/commands/tools/golden/usage-names-and-all.txt
