# Decision: the CLI's bridge gets the key of a harness agent whose model is an alias

- Approval: Paperclip task HAL-12505 (Liam approved the HAL-12488 plan, decision (a)); Liam signs this note in review
- Kind: internal

`cli.local-harness-host` said "The bridge shall be given no secrets, since every agent signs in with its own program." That was HAL-6477's rule that no key passes through the bridge until one is really used. Claude Code and Codex may use any provider that speaks the same API (HAL-403), and Liam approved ending sign-in only for an agent whose `model` is a `models.yaml` alias that names a keyed provider (decision (a) on HAL-12505). The sentence now says the bridge gets no secrets except those keys, as the new requirement `cli.harness-bridge-keys` says; nothing else in the requirement changes.

- The key check is the built-in loop's (`cli.harness-model-access`): trust for an address other than the type's own, the key's allowed origins, and trust for any real provider. It runs before the key is named.
- The bridge's secrets give a key only by a name a bridge of the engine was given, and never Halonic's own or a plugin's.
- The bridge spends the key only on the alias's own model (`harness-bridge.keyed-model`), so every call is priced as the alias says.
- Every other harness agent keeps the program's own sign-in, as before.

## Covers

- cli.local-harness-host
