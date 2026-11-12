# Decision: test the installer's sandbox scripts against the agent host's outcomes

- Task: HAL-1451 (S1: set up the agent sandbox from the installed app)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-1451](/HAL/issues/HAL-1451)
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `installer-windows` job's step "The sandbox step maps each outcome to its exit code and its reason" gets a new fake agent host. It answers `--sandbox-setup` and `--sandbox-remove` with the JSON line the real host prints, including its `outcome`. The cases are ready, cancelled, failed, check failed and a setup that hangs, plus remove: ok, cancelled, failed and nothing set up. The scripts are no longer called with `-NoElevate` or `-CheckSeconds`, because they elevate nothing and no longer run a separate check. Same triggers, same read-only rights, no secrets, publishes nothing.

## Why

`sandbox-step.ps1` and `sandbox-remove.ps1` now run the same `--sandbox-setup` / `--sandbox-remove` that Studio's Settings runs (HAL-1451). The agent host asks Windows itself, through the signed helper. The test must follow the scripts.

## Covers

- .github/
