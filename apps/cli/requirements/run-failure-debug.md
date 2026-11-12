# cli.run-failure-debug

- Status: active
- Since: 0.1.0
- Source: HAL-6613, item 3 of HAL-6585 (found by Sofia on HAL-6556); line 2's words and the detail lines are the team's call with Sofia on HAL-6613

When a run fails and the command line has `--debug`, `halonic run`, `halonic runs send` and `halonic runs show` shall print the failure's two lines as without it, except that the general lines' fix shall not ask for `--debug` again: it reads "Report it with the details below:" and the link to report it. Under the result, on stderr, they shall print what the run log holds about the failure: "The engine said:" and the `error` of `run.failed` when it isn't empty; "The provider said:" and the `providerText` of `run.failed`, with its HTTP status when it has one; and "Model calls in this step:" with, one per line, each `llm.request`, `llm.fallback` (with its own `providerText` under it) and `llm.skipped` after the step the run last entered, the same request made again straight after counted on one line; or "No model calls in this step." when there are none. Every secret value the command loaded shall be removed from the whole text before it is split into lines, as an error's `--debug` text is. Without `--debug` none of it shall be printed, and it shall never be part of stdout or `--json`. A cancelled run shall get no details.

## Examples

- Given the Acme example whose test model's script for Writer is broken,
  when `halonic run support-reply --debug` runs,
  then line 2 is "Report it with the details below: https://github.com/halonic-com/halonic/issues", and stderr starts with "The engine said:" and the engine's error, and ends with the step's model calls.
- Given a failed step that called claude at Anthropic twice, then moved from smart to fast after HTTP 529 "overloaded", then skipped fast for want of its key,
  when its details are printed,
  then they list "writer called claude at anthropic twice", the move with "The provider said (HTTP 529): overloaded" under it, and "writer skipped fast: its key isn't set, then tried default".
- Given a result whose details quote a loaded secret that holds a line break,
  when it is printed with `--debug`,
  then the secret reads "[secret removed]"; without `--debug`, stderr stays empty.
