# Decision: the Models line says a cloud key couldn't be read instead of calling it unset

- Task: HAL-14629
- Approval: decided by the team on HAL-14629 (Julian's review of #4189 on HAL-14269; the wording reuses the Secrets line's approved form, HAL-2282 rule). Liam signs on review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BRWnGXNCWCda5lmHx+GxANwhWp0N8wyrJY0oJKfoYw+642En88nMO5GqphFmdd+EsmFjcV3c/kaXXYlCY1/6CQ==

## What changes

Since #4189, a cloud provider's key that the secret store can't be asked about (for example, a
locked keychain) counted as not stored. The Models line then said the alias "needs an API key",
which leads the user to `halonic secret set` and could overwrite a key that is really there.

Now the Models line is a `!` warning in the Secrets line's words, once per provider, with no
`halonic secret set` command:

`! Models      couldn't read anthropic-key from the secret store (provider anthropic)`

It stays a warning, so `doctor` still exits 0. A key that is really not stored keeps its
"needs an API key" line.

The requirements `app.doctor-models` and `cli.doctor-report` say this: `app.doctor-models` gets
one sentence and one example, `cli.doctor-report` one example. The how-to page for `doctor` gets
one row. Tests are added in core, the report and the command; no test was weakened or skipped.

## Why

`doctor` shouldn't tell a user to set a key it only failed to read. Setting it again can replace
the right key with a wrong one, and the real fix is to unlock the store and run `doctor` again.

## Covers

- app.doctor-models
- cli.doctor-report
