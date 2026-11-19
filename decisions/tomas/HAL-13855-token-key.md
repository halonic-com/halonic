# Decision: Halonic makes the token key itself, the first time a token is sealed

- Task: HAL-13855
- Approval: Liam chose option 2 on HAL-13854 (Halonic makes the key, so nobody makes one by hand); this is a security pull request, reviewed by Liam on its own review task, with Julian checking the threat side, and Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hqEMMlrJP3cwExsOSv7KrYK09CFQIgYwmDZ3kzCvo1RCHPaYeWnSg+1hSK8Kf+cn7I0IHLE4ImalMvhnAr0HBQ==

## What changes

- `token-store.made-token-key` (new): `madeTokenKey` reads `token-key` from the secrets it is given (the environment, then the profile's secrets file) and uses a key found there as it is. Without one, it makes 32 bytes from the system's cryptographic generator, in base64url, and stores them with `setIfMissing`, so two programs that make a key at once both use the one stored first. While any of the profile's token stores holds a token, it makes no key and throws `TokenKeyMissingError` (kind `conflict`), because a new key couldn't open them.
- `secrets-file.set-if-missing` (new): `FileSecretStore.setIfMissing` stores a value only when the name has none, and answers what is stored.
- `secrets-file.store`: every save now holds a write lock in the secrets folder (`write.lock`, the record store's `RunLockRecord` rules), so saves from two programs at once no longer lose one. The sentence that said they may is replaced, and an example with two stores over one file is added. No example is removed.
- `profile.token-folders` (new): the profile names its two token folders, `google/tokens` and `integration-sign-ins/tokens`, so the CLI and the host check the same places before making a key.
- `agent-host.profile-token-key` (new): the host reads and makes the key as the CLI does, for both the Google setup and the integration sign-ins.
- `cli.commands.google.secret` and `cli.commands.google.sign-in`: "stop when `token-key` isn't set" becomes "make the key while no token is sealed; stop with exit 5 and a fix line when the key is gone but sealed tokens remain". The old example "Given no `token-key`, then it asks for no value" is replaced by two: a fresh profile gets a key and saves, and a missing key with sealed tokens stops before the prompt. The CLI's old fix line ("Set the secret token-key to 32 random bytes…") is gone.
- Test `agent-host.google-secret-routes` "answers 502 … when it can't finish": it made the host fail by giving it no key, which now just makes one. It now seals a secret with another key first, so the host has a token it can't open and still fails the same way. Its assertions are unchanged.

## Why

On `main` nothing made `token-key`, and both `halonic secret set` and the Studio refuse the name, so nobody could finish Google setup without making a key by hand. The key goes in the profile's secrets file, where a hand-made key already lived, so people who made one keep it; `HALONIC_SECRET_TOKEN_KEY` still wins and is never copied or replaced. The file lock is needed because the CLI and the Studio's host may save at the same moment, and a lost save could drop the key after tokens were sealed with it.

## Covers

- secrets-file.store
- cli.commands.google.secret
- cli.commands.google.sign-in
- agent-host.google-secret-routes
