# std.secret-shape

- Status: active
- Since: 0.1.0
- Source: HAL-1844 (design-to-build 5; flow-assistant 5.9, flow-agents 4.4, microcopy 21)

When text holds one of the prefixes `sk-`, `GOCSPX-`, `AIza`, `ghp_`, `github_pat_` or `xoxb-` at the start of a run of letters, digits, `-` and `_`, followed by at least 16 more of them that include a digit or a capital letter, `findSecretShape` shall return that secret's kind, and only its kind; otherwise it shall return `undefined`. When the text holds more than one, it shall return the kind that comes first in the text.

| Prefix | Kind |
| --- | --- |
| `sk-` | `ai-provider-key` |
| `GOCSPX-` | `google-client-secret` |
| `AIza` | `google-api-key` |
| `ghp_`, `github_pat_` | `github-token` |
| `xoxb-` | `slack-token` |

## Examples

- Given `here is my key: sk-ant-` followed by 40 letters and digits, then it returns `ai-provider-key`.
- Given `GOCSPX-` followed by 28 letters and digits, then it returns `google-client-secret`, so Studio can send the user to the Google setup's secret field instead of the providers page.
- Given `sk-` followed by 16 letters and digits, then it returns `ai-provider-key`; followed by 15, it returns `undefined`.
- Given `we use sk-learn for this`, then it returns `undefined`.
- Given `sk-learn-tutorial-for-beginners`, then it returns `undefined`: the run is long enough, but holds no digit or capital letter.
- Given a prefix inside a longer word, such as `task-` or `xGOCSPX-` followed by 20 letters, then it returns `undefined`.
- Given `Google secrets start with GOCSPX- and keys with AIza.`, then it returns `undefined`.
- Given a GitHub token followed later by a Google client secret, then it returns `github-token`.

## Why only the kind

The Assistant, Try it and the Inbox ask this check before a message is sent, saved or logged. The
answer never holds the matched text, so a caller can't put the key into a log or an error report
by passing the answer on.
