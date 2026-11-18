# app.no-unfenced-run-consent

- Status: active
- Since: unreleased
- Source: HAL-12639 (C54 docs check, item Q2, decided by Liam); the yes itself is `app.unfenced-runs`

While no host offers the yes to run plugin and integration code without the sandbox, the app shall give hosts a consent store that never holds a yes: reading it shall always find none, saving a yes shall keep nothing, and removing one shall do nothing and not fail. `UnfencedRuns` deciding with this store shall therefore answer `needs-yes` whenever the fence isn't there, even after `allow`, and `fenced` when it is.

## Examples

- Given the store, when a yes for `windows` is saved and the store is read, then it holds no yes.
- Given `UnfencedRuns` with the store, when the user's yes for `windows` is allowed and the status is `not-fenced` for `windows`, then the decision is `needs-yes` for `windows`.
- Given `UnfencedRuns` with the store, when the status is `fenced`, then the decision is `fenced`.
