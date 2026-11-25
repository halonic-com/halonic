# Decision: the Linux sandbox fence job runs the OpenCode egress test

- Task: HAL-18680
- Approval: plan approved by Liam on HAL-16826 (PR 3c: the egress test in the Linux sandbox CI job); Liam signs this note in review
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, three changes:

- The `sandbox-fence` area also matches `packages/adapters/harness-opencode/`.
- The Linux `Sandbox fence (bubblewrap)` job installs `strace` with its other apt packages.
- The same job gets two new steps before the agent host build:
  - **Install OpenCode (pinned, this job only):** `npm pack @opencode/cli-linux-x64@2.3.0`, a check of the tarball's sha512 against the pinned integrity, unpacking without running any script, and a check of `opencode --version`.
  - **OpenCode egress through the fence:** `pnpm test:fence` in the adapter.

No step, check or gate is changed, weakened or skipped. No secret is passed to the new steps.

## Why

The version-bump checklist in `docs/adr/2026-11-24-opencode-harness-program.md` requires the egress test to pass on every OpenCode version Halonic supports. That test needs the real program, bubblewrap and strace, and only this job has a fence that can start. The binary is pinned by version and integrity in the workflow, like the Claude Code pin, instead of as a `package.json` dependency, so a 250 MB binary stays out of every install.

## Covers

- .github/
