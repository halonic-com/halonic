# Decision: allow-address names only the CLI's store

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15262 (team wording call on flow check 38's C552 findings 1 and 7, HAL-15218; small wording on approved screens, HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MtTBnJQuyFEQiNe1NztrqUfKeJ5G8IiILqJB2xD4s0N97ohQoEoQuI80m2ERw1uS8KTKPlzXH7h2PMW7907QCA==

`halonic models allow-address` without a saved key said "Save it with halonic secret set *key* or on
the Models page first." The Models page saves into the keychain, which the CLI never reads
(`docs/security/trust.md`), so the second half sent people to a dead end. The line now ends at
"Save it with halonic secret set *key* first."

The Settings half of this change (Take back says why once) landed on `main` first, in C553's fix (HAL-15227), so this pull request no longer changes Settings.

## Covers

- cli.commands.models.allow-address
