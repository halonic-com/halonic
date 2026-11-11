# profile.harness-settings-folder

- Status: active
- Since: 0.1.0
- Source: HAL-6169; one sign-in per agent per workspace: HAL-5355

The profile package shall give each agent of a workspace one folder per harness for that harness's own settings, at `harness-settings/<agentId>/<harnessId>` inside the workspace's folder in the profile (`profile.workspace-folders`), so the CLI, the Studio and the harness profile host all name the same folder. The folder shall not depend on a deployment. It shall throw a `RangeError` for an agent id or a harness id that is not 1 to 64 lowercase letters, digits, `-` or `_` starting with a letter or digit, or that is a Windows device name (`con`, `prn`, `aux`, `nul`, `com0`–`com9`, `lpt0`–`lpt9`), because each id names a folder.

## Examples

- Given agent `writer` and harness `claude-code`, when the harness settings folder is asked for, then it is `harness-settings/writer/claude-code` inside the workspace's folder, joined the platform's way.
- Given agent `writer` and harnesses `claude-code` and `codex`, when their harness settings folders are asked for, then they differ.
- Given agent `writer` in two different workspaces, when their harness settings folders are asked for, then they differ.
- Given agent id or harness id `../writer`, `Writer`, an empty id, `con` or an id of 65 characters, when the harness settings folder is asked for, then it throws a `RangeError`.
