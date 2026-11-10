# format.secret-names

- Status: active
- Since: 0.1.0
- Source: HAL-2269 (from the words check on HAL-2254, item 4), HAL-2659 (quote only a typo); the Google `client` from HAL-2660 and HAL-2932; the Google `secret` from HAL-2955; words are placeholders from HAL-2264 P8

When `parseFile` reads a provider file or a connector file, the format shall check every value the file gives as a secret's name: a provider's `secret`, the `secret` of a connector that isn't a Google connector and each value of a connector's `transport.stdio.secretEnv`. A value that looks like a key shall fail with the error `secret-looks-like-key`. Otherwise a value that breaks the name rule of the `Secrets` port shall fail with the error `secret-name`. The `secret-name` message shall repeat the value only when it breaks the rule the way a typo does: it would pass the rule with each space and dot written as `-`. Otherwise it shall give the value's length when the value is over 128 characters, and only say that the name has characters that can't be used when it isn't. The `secret-looks-like-key` message shall never repeat the value.

A Google connector's `transport.google.client` names no secret: the OAuth client's ID and secret come from the account's Google setup, and their token names are set by `google-setup.store-names` alone. The format shall form no secret name from `client`, and shall fail it only with `secret-looks-like-key` when it looks like a key.

A Google connector's `secret` names no secret either: the account's Google setup keeps the refresh token as `google-account-<accountRef>` (`google-setup.store-names`). The format shall form no secret name from it, and shall fail it only with `secret-looks-like-key` when it looks like a key.

A value looks like a key when `findSecretShape` finds a known key format in it (`sk-`, `GOCSPX-`, `AIza`, `ghp_`, `github_pat_`, `xoxb-`), when it holds a UUID (8-4-4-4-12 hex digits, in either case), or when a part of it between `-` and `_` is at least 20 characters and holds both a letter and a digit.

## Examples

- Given a provider with `secret: openai-key`, when it is parsed, then it passes.
- Given a provider with `secret: openai key`, when it is parsed, then it fails with `secret-name` at `secret`, line 3, and the message quotes `openai key`.
- Given a provider with `secret: openai.key`, when it is parsed, then it fails with `secret-name` and the message quotes `openai.key`.
- Given a provider whose secret is `Hunter2!x`, `pass@word`, a name with `é` or a name with a control character, when it is parsed, then it fails with `secret-name` and the message doesn't repeat it.
- Given a provider whose secret is an Anthropic key, an OpenAI key, a Google API key, a GitHub token, a Slack user token, a 40-character hex token, a 20-character AWS access key ID, a bare UUID or a name followed by a UUID in capitals, when it is parsed, then it fails with `secret-looks-like-key` and the message doesn't repeat it.
- Given a provider whose secret is over 128 characters, when it is parsed, then it fails with `secret-name` and the message gives only its length.
- Given a connector with `secretEnv` values `files-token`, `other token` and a pasted GitHub token, when it is parsed, then it fails with `secret-name` at the second and `secret-looks-like-key` at the third, each at its line.
- Given a Google connector with `client: work google` or a `client` of 200 characters, when it is parsed, then it passes: `client` forms no secret name.
- Given a Google connector whose `client` is any of the pasted keys above, when it is parsed, then it fails once with `secret-looks-like-key` at `transport.google.client` and the message doesn't repeat it.
- Given a Google connector with `secret: mailbox refresh`, when it is parsed, then it passes with no warning: `secret` forms no secret name.
- Given a Google connector whose `secret` is an Anthropic key, when it is parsed, then it fails once with `secret-looks-like-key` at `secret`, line 3.
- Given `openai-key`, `anthropic-2025-production` or `sk-learn`, when `looksLikeKey` is asked, then it says no.
