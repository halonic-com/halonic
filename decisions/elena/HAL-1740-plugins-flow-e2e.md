# Decision: run the plugins Playwright flow in the CI e2e job

- Task: HAL-1740
- Approval: Liam approves this change on HAL-1740 (pending: link the approving comment here before signing).
- Kind: internal
- Signature: pending

## What changes

`.github/workflows/ci.yml` gains one step, "Plugins flow", in the existing Studio end-to-end job. It runs the new `e2e` script of `@halonicjs/studio-feature-plugins`. No existing step, check or gate is changed, weakened or skipped.

## Why

HAL-1740 asks for a Playwright flow (add from a folder, trust, run a command, remove). CI is the only place browsers run.

## Covers

- .github/
