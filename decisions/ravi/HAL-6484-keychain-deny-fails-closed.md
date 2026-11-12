# Decision: a session that denies the key store doesn't open when srt drops the deny

- Approval: [HAL-6484](/HAL/issues/HAL-6484) (Liam's review follow-up on HAL-6346). Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Ep62PaUo98Cga8o99v+s+B2/D372xqbuTTSf0HvHP62q/dhvxa03B7CJ855TtmfgBKYer+Bfx5oTlaf6wDatDw==
- Task: HAL-6484

## What changes

- `sandbox-srt.profile-to-srt-config`: `SrtSandbox.open` reads the settings of a profile with
  `keyStore: "denied"` through srt's own schema, the one its command line uses. When the parsed
  settings don't deny `com.apple.SecurityServer` and `com.apple.securityd.xpc`, opening fails
  with an error that names the dropped services, and nothing runs. Profiles that allow the key
  store or leave it out are not checked, so they behave as before. A new example says so.

## Why

The deny comes from our pnpm patch of `@anthropic-ai/sandbox-runtime`, which adds
`network.denyMachLookup`. If the patch stops applying (an srt update, a patch file that
drifted), srt's schema drops the unknown setting without an error, and the session would run
with the Keychain reachable. Checking the parsed settings makes that case fail closed.

## Covers

- sandbox-srt.profile-to-srt-config
