# Decision: Settings › Trust moves to the Workspace feature and shows the trust state

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11795 (found in the usability walk-through HAL-11771; the wording reuses the workspace page's existing trust line, no new text)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:aO4F34gJuAy7FZs5wlHWIESWc1NUAN9bl5pKaCWgI0/SQh0fF9UwWz8W4gNBoZ1/t6dpyjtDLr7TosA/7T1+Dg==

Settings › Trust now shows whether the workspace is trusted, next to **Open Trust**, and no longer carries
the "Changes here show in Changes and can be undone" note, which was untrue for trust (the app keeps trust,
not the workspace). Trust moved from the Settings feature to the Workspace feature, which owns it, so the
requirement `settings.workspace-links` and its test file are replaced by `workspace.settings-trust`, which
covers the same links plus the trust line. Its checks are carried over, not weakened.

## Covers

- settings.workspace-links
- packages/studio/features/settings/src/links/workspace-links.test.tsx
