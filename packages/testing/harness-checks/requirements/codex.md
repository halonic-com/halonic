# harness-checks.codex

- Status: active
- Since: 0.1.0
- Source: HAL-4475 (D4 of the [HAL-194 build plan](/HAL/issues/HAL-194#document-build-plan); HAL-1710 check 1)

The Codex check shall run Codex inside srt with the environment, the `config.toml` and the `-c` arguments its adapter gives it, where the only reachable address is the run's bridge set up for a subscription, and find: where the sign-in is kept and whether `auth.json` holds a ChatGPT sign-in or an API key, whether Codex says it is signed in outside and inside the sandbox, how a one-word prompt through the bridge ended, which requests reached the bridge and which hosts the sandbox refused. It shall put back the settings folder's own `config.toml` afterwards. When asked, it shall run the prompt again on a copy of the settings folder whose last refresh is long ago, and delete the copy. It shall read from `auth.json` only which fields are there and `last_refresh`, and from Codex's answers only the exit code, the type of each `--json` event and the "Not logged in" line.

## Examples

- Given `codex login status` exiting with 0, then the answer is "yes"; with 1 and "Not logged in", "no"; with anything else, "unknown".
- Given an `auth.json` with `tokens`, then the sign-in is "chatgpt"; with only `OPENAI_API_KEY`, "api-key".
- Given a copied `auth.json` with `tokens` and `last_refresh`, when the sign-in is aged, then only `last_refresh` changes, to 30 days before now.
- Given a settings folder with its own `config.toml`, when the check ends, then the file holds what it held before.
