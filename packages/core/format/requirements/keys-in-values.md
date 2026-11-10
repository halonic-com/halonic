# format.keys-in-values

- Status: active
- Since: 0.1.0
- Source: HAL-3275 (from the secrets check on HAL-3247, item 1; save model 8.1); words are placeholders from HAL-2264 P8

When `parseFile` reads a connector, provider, runtime or knowledge file, the format shall check every text in the fields that take any value: a connector's `transport.http.headers`, `transport.stdio.env` and `transport.stdio.args`, a provider's and a runtime's `options` and a knowledge source's `config`, down through nested maps and lists. A text that holds a key shall fail with the error `value-looks-like-key` at its own path. The message shall never repeat the text, and shall say where the secret's name goes instead: the connector's `secret` for a header, `secretEnv` for a variable or an argument, the provider's `secret` for a provider option.

A text holds a key when `findSecretShape` finds a known key format anywhere in it (`sk-`, `GOCSPX-`, `AIza`, `ghp_`, `github_pat_`, `xoxb-`). Under a name that says it holds a credential (one with `token`, `secret`, `password`, `passwd`, `api-key`, `access-key`, `private-key`, `credential` or `authorization` in it, with `-`, `_` or nothing between the words, or exactly `auth`), the text also holds a key when, after a leading `Bearer`, `Basic` or `Token` is dropped, it does not start like a path (`/`, `./`, `../` or `~/`), it is made only of letters, digits, `+`, `/`, `=`, `-` and `_`, and `looksLikeKey` says yes (`format.secret-names`). An argument's name is the option before `=` in `--option=value`, or the argument before it when that starts with `-`.

## Examples

- Given an HTTP connector with the header `Authorization: Bearer sk-…`, when it is parsed, then it fails with `value-looks-like-key` at `transport.http.headers.Authorization` and the message points to the connector's `secret`, without repeating the key.
- Given an HTTP connector with the header `X-Api-Key` holding a 40-character hex token, when it is parsed, then it fails with `value-looks-like-key`; with `Accept: application/json` or `X-Trace: <40 hex>` it passes.
- Given a stdio connector with `env` `GITHUB_TOKEN` holding a GitHub token and `LOG_LEVEL: debug`, when it is parsed, then it fails once, at `transport.stdio.env.GITHUB_TOKEN`, and the message points to `secretEnv`.
- Given a stdio connector with `env` `AUTH_URL: https://login.example.com/oauth2/v2.0/authorize`, `PYTHONPATH: /opt/python3.12-tools` or `CREDENTIALS_DIR: /srv/runner/work/app2/creds`, when it is parsed, then it passes.
- Given a stdio connector with the arguments `--api-key=<40 hex>`, `--token <40 hex>` or a bare Anthropic key, when it is parsed, then each fails with `value-looks-like-key` at its index; `--rev <40 hex>` and `--token-file /var/lib/halonic2/tokens` pass.
- Given a provider with `options: { headers: { authorization: Bearer sk-… } }`, when it is parsed, then it fails at `options.headers.authorization` and the message points to the provider's `secret`.
- Given a runtime with `options: { apiToken: <AWS access key ID> }` or a knowledge source with `config: { servers: [sk-…] }`, when it is parsed, then it fails at `options.apiToken` or `config.servers[0]`.
