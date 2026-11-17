# studio.sandbox-start-check

- Status: active
- Since: unreleased
- Source: HAL-4293, HAL-1709; `app.sandbox-start-check`, `inbox.sandbox-row`

The Studio app shall give the run page and the Inbox a sandbox start check from the agent host's own sandbox check, whenever the shell has an agent host, whether or not the build offers Settings › Agent sandbox's setup: the check only reads. It shall tell those who listen when a check passes, so the Inbox's sandbox row hears of a pass made on a run page, and tell no one of a check that refuses or can't run. The result it returns is the check's own, unchanged.

## Examples

- Given a check passes, then its listeners hear once and the caller gets `{ ok: true }`.
- Given a check says `ripgrep-missing`, then no listener hears and the caller gets that reason.
- Given the host can't be reached, then the check fails and no listener hears.
