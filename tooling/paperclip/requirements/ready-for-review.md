# paperclip.ready-for-review

- Status: active
- Since: unreleased
- Source: HAL-16437, lever L5b of the Part 1 token plan (HAL-16355): agents check a pushed branch against current `main` before they open or update its pull request, using the precheck service from halonic-com/server#19 (L5a)

When an agent calls the Agent tools plugin's `ready_for_review` tool with a pushed branch and optionally its full commit id, the plugin shall start a check of that branch at the precheck service named in its settings without waiting for it, read the check until it is done or about 6 seconds have passed, so the answer comes before an agent's tool call ends, and answer `PASS`, `FAIL` with the failed steps, or with the service's reason when it stopped the check before any step ran, and the service's summary marked as log output and cut to 4,000 characters, or `RUNNING` with the check's id, which a later call passes instead of the branch to read that check, unless the plugin wakes a task for that check (`paperclip.ready-for-review-wake`); when the service is full, unreachable or answers anything but a check or a refusal, it shall answer `CHECK UNAVAILABLE` and tell the agent to go on without it, never as an error; it shall refuse without a request a missing branch, `main`, a short commit id or a malformed check id; and it shall save each call with its duration, its verdict and, for a finished check, the check's duration, tagged with the tool and the verdict.

## Examples

- Given a branch whose check passes on the second read,
  when an agent calls `ready_for_review` with it,
  then the service gets one `POST /check` with `wait: false` and one read of the check, and the answer starts with `PASS`.
- Given a check that fails `format` and `typecheck-lint`,
  when the check is done,
  then the answer starts with `FAIL: format, typecheck-lint`, says to fix, push and call again, and carries the summary marked as data, not instructions.
- Given a check the service stopped before any step ran, with the reason in `error` and no summary,
  when the check is done,
  then the answer is `FAIL` with that reason, and the reason is in the answer's data.
- Given a check that is still running after about 6 seconds,
  when an agent calls `ready_for_review`,
  then the answer is `RUNNING` with the check's id, and a later call with that `checkId` reads the check without starting a new one.
- Given a service that answers `429`, or can't be reached,
  when an agent calls `ready_for_review`,
  then the answer is `CHECK UNAVAILABLE`, with no error, and saves the verdict `unavailable`.
- Given a service that refuses the input with `400`,
  when an agent calls `ready_for_review`,
  then the answer is an error with the service's reason.
- Given `branch: "main"`, a 7-character `sha` or a `checkId` with a slash,
  when an agent calls `ready_for_review`,
  then it answers with an error and sends no request.
