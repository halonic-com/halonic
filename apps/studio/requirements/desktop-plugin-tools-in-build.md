# studio.desktop-plugin-tools-in-build

- Status: active
- Since: unreleased
- Source: HAL-17815; C3 option (a) on HAL-12374, approved by the board on 24 Nov; the feature's side is `plugins.plugin-tools-off`

The desktop app shall give the plugins host the way to ask the agent host whether its build runs plugin tools, so the plugins feature can leave out plugin cards and commands in a build that has none.

## Examples

- Given the desktop app whose agent host is the shipped single executable,
  when the plugins feature asks whether this build runs plugin tools,
  then the app asks the agent host's `GET /v1/plugins/tools` and answers no.
