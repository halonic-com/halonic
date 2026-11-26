# Decision: quick ask's box gets an end-to-end test in CI's e2e job

- Approval: the task asks for a rendered test of the box's layout (HAL-19213, from the design check on HAL-19208); Liam approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nAFG9pLYmEGNFlqiIQwuu2nxgrvhIlZDezw/jAWxgB0cAAqiPxtJmHuzs5pnz8NrJRc7TgE0xDPS49CGFYhhCA==

## What changes

`.github/workflows/ci.yml`, in the `e2e` job only:

- a step "Quick ask box" runs `pnpm e2e` in `packages/studio/features/quick-ask`, after the
  plugins flow, the same way the Workflows and Plugins steps run theirs;
- the `e2e-report` artifact also takes `packages/studio/features/quick-ask/test-results`, so a
  failure's trace can be downloaded.

No permission, secret, environment, trigger or runner changes. The browsers the job already
installs (Chromium) are the ones the test uses.

## Why

The box has to fit the 496 px its window leaves, with **Copy** and **Open in Messenger** in view
after a long answer and a reply. jsdom has no layout, so only a real browser can check that, and
CI's e2e job is the only place Playwright runs (HAL-2418).

## Tests

`packages/studio/features/quick-ask/e2e/long-answer.spec.ts`.

## Covers

- .github/
