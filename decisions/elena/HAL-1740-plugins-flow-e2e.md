# Decision: run the plugins Playwright flow in the CI e2e job

- Task: HAL-1740
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12150#comment-0cf2cf4d-d6fc-4d56-9d39-745e3f359e4f (Liam approved the Plugins flow step in the Studio end-to-end job)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FchNXbKzN+hHt7lDc+dx15uLbg8uECRStNWExBBe20ghED0Rm60WzIt8sXqb9tImtu2KWT2WcwFqnBaBAnoBDA==

## What changes

`.github/workflows/ci.yml` gains one step, "Plugins flow", in the existing Studio end-to-end job. It runs the new `e2e` script of `@halonicjs/studio-feature-plugins`. No existing step, check or gate is changed, weakened or skipped.

## Why

HAL-1740 asks for a Playwright flow (add from a folder, trust, run a command, remove). CI is the only place browsers run.

## Covers

- .github/
