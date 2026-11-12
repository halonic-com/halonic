# Decision: the Windows sandbox CI job removes the sandbox as its last step

- Task: HAL-6180 (`--sandbox-remove` for the uninstaller, HAL-1202 flow 2.7, CHECK I9)
- Approval: the task asks for this change with tests; Liam approves this note in review on HAL-6180
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cyM41nO85btM9ICzyXQPrt8jCIY95P/LzG2Gy/GUbyhy2OyEp4j/BLOxWmiQ/CGODTfO/EILxkcihhhUwNL4AQ==

## What changes

The `sandbox-windows` job in `.github/workflows/ci.yml` gets one more step, after the fence tests: `pnpm test:remove:windows` in `packages/adapters/sandbox-srt`. It removes srt's Windows sandbox the way `--sandbox-remove` does, and checks that the account, its group, the network filters, srt's machine key and the grants a session left are gone, and that a second removal is ok too. No new rights, secrets or triggers.

## Why

The uninstaller runs `--sandbox-remove` on users' computers, and only a real Windows machine with srt's install can show that it removes everything. It is the last step because it takes the install away that the fence tests need.

## Tests

The step is the test: `fence/srt-remove.windows-uninstall.test.ts`.

## Covers

- .github/
