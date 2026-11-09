# format.secret-names

- Status: active
- Since: 0.1.0
- Source: HAL-2269 (from the words check on HAL-2254, item 4); words are placeholders from HAL-2264 P8

When `parseFile` reads a provider file or a connector file, the format shall check every value the file gives as a secret's name: a provider's `secret`, a connector's `secret` and each value of a connector's `transport.stdio.secretEnv`. A value that looks like a key shall fail with the error `secret-looks-like-key`. Otherwise a value that breaks the name rule of the `Secrets` port shall fail with the error `secret-name`. Neither message shall repeat a value that looks like a key, is over 128 characters or holds a character that isn't printable ASCII.

A value looks like a key when `findSecretShape` finds a known key format in it (`sk-`, `GOCSPX-`, `AIza`, `ghp_`, `github_pat_`, `xoxb-`), when it holds a UUID (8-4-4-4-12 hex digits, in either case), or when a part of it between `-` and `_` is at least 20 characters and holds both a letter and a digit.

## Examples

- Given a provider with `secret: openai-key`, when it is parsed, then it passes.
- Given a provider with `secret: openai key`, when it is parsed, then it fails with `secret-name` at `secret`, line 3, and the message quotes `openai key`.
- Given a provider whose secret is an Anthropic key, an OpenAI key, a Google API key, a GitHub token, a Slack user token, a 40-character hex token, a 20-character AWS access key ID, a bare UUID or a name followed by a UUID in capitals, when it is parsed, then it fails with `secret-looks-like-key` and the message doesn't repeat it.
- Given a provider whose secret is over 128 characters or holds `é` or a control character, when it is parsed, then it fails with `secret-name` and the message gives only its length.
- Given a connector with `secretEnv` values `files-token`, `other token` and a pasted GitHub token, when it is parsed, then it fails with `secret-name` at the second and `secret-looks-like-key` at the third, each at its line.
- Given `openai-key`, `anthropic-2025-production` or `sk-learn`, when `looksLikeKey` is asked, then it says no.
