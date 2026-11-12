# Decision: MXC's sessions pass telemetry off on every spawn

- Approval: HAL-7826 (Liam, CTO, decided it in review of the session pull request)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7gngX12lbzVk/fQ2+PxXMONTyEzeCz1GgunsVTilUAhv+9vYuQrePQz8PxLXej8/PC4BrZ9PewU5pOIrseT5BA==
- Task: HAL-3305

## What changes

- `packages/adapters/sandbox-mxc/requirements/sdk-loading.md`: the adapter no longer "reads
  only platform support and backends". It also starts programs with the SDK's `spawn`, and it
  passes `telemetry: { enabled: false }` on every `spawn` call. It still never calls
  `requestTelemetryConsent`.
- The adapter's session code (`mxc-process.ts`, `mxc-session.ts`) passes that option on every
  call, and a test fails if a call goes without it.

## Why

Sessions have to start programs, so the adapter now uses `spawn`. Passing `telemetry` off
explicitly, rather than leaving it out, means a default in a later SDK version can't turn
reporting on. Never asking for consent keeps the user from being prompted by a library
inside a sandbox.

## Known gaps

- MXC isn't offered to users until the probes cover the internet, DNS and other host
  addresses, with a positive network control (a probe that fails for an unrelated reason
  still counts as "blocked" today). A follow-up task tracks it.
- Programs that need read-only files get a refusal for now; copying them into a box folder is
  a follow-up task.

## Covers

- packages/adapters/sandbox-mxc/requirements/sdk-loading.md
