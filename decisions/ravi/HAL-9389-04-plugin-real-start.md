# Decision: the plugin route starts a trusted plugin's backend for real, and refuses in the shipped executable

- Requirement: `agent-host.plugin-routes` (`apps/agent-host/requirements/plugin-routes.md`)
- Task: HAL-9389
- Approval: HAL-9389, the code reviewer's choice of option 2 on the pull request (serve the real start only outside the single executable for now, typed refusal inside it); the plan was approved on the same task
- Kind: internal

## What changes

The requirement `agent-host.plugin-routes` is edited, not retired.

- Outside the single executable, `POST /v1/plugins/call` now starts the trusted plugin's backend for real, in the host's fenced sandbox. The start refuses a folder whose fingerprint differs from the one just checked, and the plugin id is an allow-list of lower-case letters, digits, `.`, `_` and `-`.
- Inside the shipped single executable, the route answers `403 not_in_this_build` and starts nothing. There `process.execPath` is the host itself, not Node, so a runner start would fail or start a second host without the Node permission layer. A real runner mode in the executable is a separate task.
- `not_fenced` still answers 403 and starts nothing, with no unfenced fallback.

## Why

A refusal is the safe answer until the executable has a runner mode. It lets the route and its tests land without shipping an unsafe start.

## Tests

No test was weakened, skipped or removed. New tests cover the real start, the fingerprint refusal, the id allow-list and the refusal in the executable, and name the requirement.

## Covers

- agent-host.plugin-routes
