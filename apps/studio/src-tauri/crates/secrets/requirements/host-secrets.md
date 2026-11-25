# studio.src-tauri.crates.secrets.host-secrets

- Status: draft
- Since: unreleased
- Source: HAL-14090, HAL-14126, HAL-18501 (server pairings)

When the agent host asks the shell to get, set or delete one of its own secrets, the shell shall check the name against the secret name rule and accept it only when its canonical form is in `HOST_NAMES`, which holds only `remote_host_key`, or when the name as sent is a server pairing's in its one exact form, `server-pairing__` followed by exactly 32 lower-case hex digits, with nothing folded or trimmed, and check the value for `set` as `secret_set` does, before the backend runs. It shall return the value or nothing for `get`, replace any stored value for `set`, and succeed for `delete` even when nothing is stored. It shall handle exactly one name per request, with no listing and no wildcard. If the name is any other one, including `token_key`, `serve_password`, a token, a workspace's key or another spelling of a server pairing (`Server-Pairing__…`, `server_pairing__…`, upper-case hex), then the shell shall refuse it with `reserved_name` and the backend shall not run. `HOST_NAMES` and the prefix `server_pairing__` shall stay a part of Halonic's reserved names, so the page's secret commands never reach the host's secrets.

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
- Given the host stores `server-pairing__0123456789abcdef0123456789abcdef`,
  when it reads the same name,
  then it gets the value, kept as `server_pairing__0123456789abcdef0123456789abcdef`.
- Given the host asks for `Server-Pairing__0123456789abcdef0123456789abcdef`,
  when the shell checks it,
  then the result is `reserved_name` and nothing is read: the cases both sides check are in `tests/fixtures/server-pairing-names.tsv`.
- Given an empty value for `remote_host_key`,
  when the host stores it,
  then the result is `invalid_value` and nothing is written.

## What it doesn't cover

Who may send these requests: only the agent host the shell started, over its own pipe (`crates/agent-host`, requirement `host-secrets-channel`). The page has no command for them.
