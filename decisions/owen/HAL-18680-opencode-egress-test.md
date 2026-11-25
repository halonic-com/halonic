# Decision: the Linux sandbox fence job runs the OpenCode egress test

- Task: HAL-18680
- Approval: plan approved by Liam on HAL-16826 (PR 3c: the egress test in the Linux sandbox CI job); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+1om37J5ENto+0KpuTRV9fwjlys5M5WxczV/J8yYuptq3sV9FLjebHbsrQCzJiD2gyrVX4ls3UJzHT7ZNoZJCw==

## What changes

In `.github/workflows/ci.yml`, three changes:

- The `sandbox-fence` area also matches `packages/adapters/harness-opencode/`.
- The Linux `Sandbox fence (bubblewrap)` job installs `strace` with its other apt packages.
- The same job gets two new steps before the agent host build:
  - **Install OpenCode (pinned, this job only):** `npm pack @opencode/cli-linux-x64@2.3.0`, a check of the tarball's sha512 against the pinned integrity, unpacking without running any script, and a check of `opencode --version`.
  - **OpenCode egress through the fence:** `pnpm test:fence` in the adapter.

No step, check or gate is changed, weakened or skipped. No secret is passed to the new steps.

`packages/adapters/harness-opencode/fence/opencode-egress.test.ts` is new. Its fenced cases are skipped
(`describe.skipIf`) on a computer without Linux, the pinned `opencode` and `strace`, and a guard case
(`it.runIf`) fails in CI when any of them is missing, so the CI job can never pass by skipping.

## Why

The version-bump checklist in `docs/adr/2026-11-24-opencode-harness-program.md` requires the egress test to pass on every OpenCode version Halonic supports. That test needs the real program, bubblewrap and strace, and only this job has a fence that can start. The binary is pinned by version and integrity in the workflow, like the Claude Code pin, instead of as a `package.json` dependency, so a 250 MB binary stays out of every install.

The skip lets `pnpm test:fence` run on a developer's computer, where the fence's programs are usually
missing, without failing for the wrong reason, like the Claude Code fence test in `apps/cli/fence`.

## Covers

- .github/
- packages/adapters/harness-opencode/fence/opencode-egress.test.ts
