# services.agent-host-harnesses

- Status: active
- Since: 0.1.0
- Source: HAL-4878 (part 6c)

The Studio's harness stand-ins for the agent host shall each carry the harness's own `environment` function by its id: `claudeCodeEnvironment` for `claude-code` and `codexEnvironment` for `codex`, taken from the adapters' browser-safe `./environment` entry points. They run on the page, so the bridge's token goes into the sandbox profile and nowhere else. A harness the host lists without such a function shall have no `environment`.

## Examples

- Given the agent host lists `claude-code` and `codex`,
  when the Studio gets its harnesses,
  then each one's `environment` gives the same variables as the adapter's own function.
- Given the agent host lists a harness the Studio has no function for,
  when the Studio gets its harnesses,
  then that harness has no `environment`.
