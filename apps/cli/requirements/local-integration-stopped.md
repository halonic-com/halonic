# cli.local-integration-stopped

- Status: active
- Since: unreleased
- Source: HAL-15666 (item 6 of HAL-15537: a local integration whose fence didn't hold said "the sandbox failed its check, so nothing runs", which is wrong, because the check passed, and names nothing); words decided by the team (HAL-2282) on HAL-15666, the same as the plugin's in `cli.plugin-backend-stopped` since C599 and C630 #4 (HAL-15788)

When the `halonic` command opens a local integration for a run and the start gate stops its runner because the runner's fence proof failed though the computer passed the sandbox check, the call that needed the integration shall fail with a message that says "the sandbox didn't work when the integration <folder> started, so none of it ran. Halonic tries <folder> in the sandbox again the next time a run uses it.", where `<folder>` is the integration's folder under `integrations/`. It shall not say that the sandbox failed its check, because the check passed. The next call that needs the integration shall start a runner again.

## Examples

- Given a trusted integration in `integrations/notes` whose runner's fence proof fails,
  when a run calls its tool,
  then the call fails with "Connector "notes" didn't start: the sandbox didn't work when the integration notes started, so none of it ran. Halonic tries notes in the sandbox again the next time a run uses it.", the runner is stopped, and the next call starts a runner again.
