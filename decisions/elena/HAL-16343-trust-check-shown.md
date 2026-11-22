# Decision: Trust saves only the check shown, and Check asks only this computer until trusted

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16343 (triaged on HAL-16327; Liam reviews the trust changes)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SspubkTnYwZEVheE9aZ60aa+n0/RqTTA427e5UEW5GF98UmsSuSIsctt8dUE7Rgo5AJYKV2JaNCoxBFS0GqABw==

**The trust dialog.** When the workspace changed while the trust dialog was open, the dialog showed
the new check with "This workspace changed while you were reviewing it. Check the new version.", but
**Trust** saved the new fingerprint straight away, so a click a moment after the change trusted a
check the person hadn't read. Trust now saves only the check that was shown: pressed after a change,
it saves nothing, says "Couldn't save trust: this workspace changed. Nothing was started." (the
existing failure line) and counts the new check as shown, so the next Trust saves it. The
requirement `workspace.trust-badge` says so. The test "shows the new check, and says so, when the
workspace changes under an open dialog" ended with one Trust saving the new fingerprint; that ending
moves to a new test, which checks that the first Trust saves nothing and the second saves the new
check. No test was weakened.

**Check on a provider's page.** Check sent a GET to the provider's `baseUrl` from the workspace's
files, query included, before anyone trusted the workspace. Until the workspace is trusted, Check
now asks only an address on this computer (`localhost` or a loopback address), without its query,
and shows no Check for any other address. The draft requirement `models.providers.check` says so. The
existing tests now say the workspace is trusted, and a new test covers the untrusted case.

## Covers

- workspace.trust-badge
- models.providers.check
- packages/studio/features/workspace/src/trust/workspace-trust-badge.test.tsx
- apps/studio/src/models/workspace-provider-check.test.ts
