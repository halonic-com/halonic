# paperclip.pr-watcher-pass-route

- Status: active
- Since: unreleased
- Source: HAL-19720 (part of HAL-17974, the PR watcher as a Halonic workflow under `halonic serve`)

When a `pr-watch` pass has run the `pr-watcher` signal rule for a company, the plugin shall keep, in plugin state, the rule's input for that pass and the done and wake actions today's watcher wrote in it, and the `GET /pr-watcher/pass` route shall answer them read-only as `{ at, input, actions, truncated }`, for a signed-in board user only (like `github/summary`), reading plugin state only. The answer shall hold no key, login or person's name, and stay under the 16 KB ToolScript `inputBytes` default: when the rule had more than one input, a task was too large for one, or the actions push it over, tasks are left out from the end and `truncated` is true.

## Examples

- Given the recorded pull requests of 22 Nov, one merged green and one red and conflicting, each on a task its author holds,
  when a `pr-watch` pass runs and then the board calls the route,
  then `input` is the input the rule decided from, and `actions` are exactly the done and wake actions the watcher wrote.
- Given an agent's call, then the route answers 403 and reads nothing.
- Given no pass yet, then the route answers `at: null` and no input.
- Given more watched tasks than fit in 16 KB, then the answer fits and says it is truncated.
