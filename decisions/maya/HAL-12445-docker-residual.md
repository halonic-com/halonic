# Decision: the sandbox choice lists `docker-desktop-visible` as a backend residual

- Task: HAL-12445 (finding F3 of the srt-wsl security review, HAL-12434)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12512 (Liam approved the plan on HAL-12445: the new residual in `core/ports` and the new codes in `core/app`); Liam signs this note as the reviewer of `core/app`
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8ouUFI5+x4cHd2dAP0yIsdPnctcYXo2yAr8IZl9INtsVRa9Z5x7MbK/KBx7itrCYK1HmPysuiGp7YyCwilleDg==

## What changes

The active requirement `app.sandbox-choice` changes in one example only. The example for a
backend whose `ok` check brings residuals of its own names today's residuals: it now lists
`docker-desktop-visible` next to `kept-roots-readable`. What the example says stays the same:
those residuals are listed next to those of the trust check, and neither replaces the other.

The srt sandbox, run in Halonic's WSL distro, now reports `docker-desktop-visible` from its `ok`
check (new requirement `sandbox-srt.wsl-start-checks`). `SandboxResidual` in `core/ports` gains the
code without a new port version, and `limitCodes` in `core/app` gains `docker-desktop-visible` and
`default-distro`.

Nothing a user sees changes yet: Studio shows the two residuals once their words land (PR 4 of the
plan). No test was weakened or removed.

## Why

W6 in the threat model says the trust check reports Docker Desktop in the distro. Until now only the
setup checked it, once. Docker Desktop is often installed later, so the check runs every time the
sandbox is checked.

## Covers

- app.sandbox-choice
