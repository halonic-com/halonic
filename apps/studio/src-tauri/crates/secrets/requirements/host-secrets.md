# studio.src-tauri.crates.secrets.host-secrets

- Status: draft
- Since: unreleased
- Source: HAL-14090, HAL-14126

When the agent host asks the shell to get, set or delete one of its own secrets, the shell shall check the name against the secret name rule and accept it only when its canonical form is in `HOST_NAMES`, which holds only `remote_host_key`, and check the value for `set` as `secret_set` does, before the backend runs. It shall return the value or nothing for `get`, replace any stored value for `set`, and succeed for `delete` even when nothing is stored. If the name is any other one, including `token_key`, `serve_password`, a token or a workspace's key, then the shell shall refuse it with `reserved_name` and the backend shall not run. `HOST_NAMES` shall stay a part of Halonic's reserved names, so the page's secret commands never reach the host's secrets.

## Examples

- Given the host stores `remote-host-key`,
  when it reads `remote_host_key`,
  then it gets the same value, kept as `remote_host_key`.
- Given the keychain holds `serve_password` and the workspace key `provider_anthropic`,
  when the host asks for either,
  then the result is `reserved_name` and nothing is read.
- Given the host asks to store `token_key`,
  when the shell checks it,
  then the result is `reserved_name`: `token_key` stays in the CLI's file until HAL-14148.
- Given an empty value for `remote_host_key`,
  when the host stores it,
  then the result is `invalid_value` and nothing is written.

## What it doesn't cover

Who may send these requests: only the agent host the shell started, over its own pipe (`crates/agent-host`, requirement `host-secrets-channel`). The page has no command for them.
