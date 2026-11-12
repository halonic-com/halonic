# Decision: the untrusted profile denies the OS key store, and srt's macOS fence enforces it

- Approval: HAL-6346 (design HAL-958, section 6, attack case A36). Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/9UvQ2zt/IQMAUCcfVqWpnE233ZK4DccAu9aMu333gpEWPSEsTuGNgxu5GmhIQYPuo5KAgbSE8rJ9yzZ9IzABw==
- Task: HAL-6346

## What changes

- `sandbox-srt.profile-to-srt-config`: a profile with `keyStore: "denied"` gets
  `com.apple.SecurityServer` and `com.apple.securityd.xpc` denied at the end of srt's Seatbelt
  profile, after srt's own allows of them. Without it, no Mach service is denied, so existing
  profiles behave as before. A new example says so.
- `integration-runner.start`: the untrusted profile also denies the OS key store (A36 added to
  the source).
- `packages/adapters/sandbox-srt/fence/srt-keychain.test.ts`: a new fence test that runs on
  macOS only (`describe.skipIf(!isMac)`), because the Keychain and Seatbelt exist only there. It
  asks the Keychain from a session that allows the key store (the item comes back, as srt does
  by default) and from one that denies it (no item).
- `tooling/check/src/test/fixture-repo.ts` and `patches.test.ts`: test setup only. Now that the
  real `pnpm-workspace.yaml` applies the srt patch, a fixture repo built from the real files also
  gets the patch files the real `patches-allowed.json` names, and the patch tests start from the
  real workspace file without its own `patchedDependencies:`. The guard's code is unchanged.

## Why

A36 found that `security find-generic-password` gets a Keychain item back inside the fence:
srt always allows the securityd Mach services, and only Node's own layer stopped the runner.
The deny is per profile, not for every session, because an agent such as Claude Code or Codex
can keep its own sign-in in the Keychain and must still read it in the fence.

## Covers

- sandbox-srt.profile-to-srt-config
- integration-runner.start
- packages/adapters/sandbox-srt/fence/srt-keychain.test.ts
- tooling/check/
- tooling/check/src/test/fixture-repo.ts
- tooling/check/src/test/patches.test.ts
