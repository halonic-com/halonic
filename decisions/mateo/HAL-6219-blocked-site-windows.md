# Decision: the Windows fence job checks that a blocked site gets no connection

- Approval: Elena asked for this on [HAL-6219](/HAL/issues/HAL-6219), after Julian's decision on [HAL-6208](/HAL/issues/HAL-6208); the CTO (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kjlXC9LIrfFVNgfdZmSzrq8s05t5jWCTFTUevfnzGPV9PeS/OZ2XHhaLHa4g8Q1h4lpX8NlT4vXN02fnQ7unDA==
- Task: HAL-6219

## What changes

The `sandbox-windows` fence job in `ci.yml` gets one new step before "Fence test through
SandboxSession": it adds `blocked.example` and `allowed.example` for 127.0.0.1 to the runner's
hosts file and flushes the DNS cache. The step that follows already runs `pnpm test:fence:windows`,
which now also picks up `fence/srt-blocked-site.windows.test.ts`. No other step, permission or
trigger changes.

## Why

Studio's hint under blocked sites says "No connection was made". Julian's condition on HAL-6208 is
that Windows runs show it only once a Windows test proves it. The two names let the blocked and the
allowed site differ only in their name, so the allowed site is the control for the blocked one.

## Covers

- .github/
