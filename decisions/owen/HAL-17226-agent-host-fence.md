# Decision: the sandbox fence jobs also run the packed agent host's coding tools mode

- Approval: the task asks for this change (HAL-17226, from Liam's review of #5562); Liam approves this note in review
- Kind: internal

## What changes

- `ci.yml`'s bubblewrap (Linux) and Seatbelt (macOS) fence jobs build the agent host executable with `pnpm build:sea` after the CLI's fence tests, and run `pnpm test:fence` in `apps/agent-host`.
- The `sandbox-fence` change filter also covers `apps/agent-host/fence/`, its `scripts/`, `src/main.ts`, `src/coding-tools-mode.ts` and `packages/adapters/coding-tools/`, so a change to the mode or the server runs these jobs.

## Why

Only the CLI's coding tools server ran in a real fence. The agent host starts the server from its packed payload, which lies in Halonic's denied data folder and is opened again read-only for the run. Only the real fence shows that this works and that the server still can't read the profile.

## Tests

`apps/agent-host/fence/coding-tools-mode.fence.test.ts`, in both fence jobs.

## Covers

- .github/
