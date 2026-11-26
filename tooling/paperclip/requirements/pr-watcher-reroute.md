# paperclip.pr-watcher-reroute

- Status: active
- Since: unreleased
- Source: HAL-19203, the board's ask of 26 Nov: reviews held by a reviewer who is parked on a pool wait or at a seat or usage limit waited for the review-wait note instead of going to the other reviewer

When the PR watcher checks an open task, not in `backlog` or `blocked`, that Liam or Julian holds as its reviewer (not the author of its pull requests) with no run working on it (a queued or parked run doesn't count), and one of its open pull requests is out of draft, not in the merge queue, has a green `ci-ok` on its head and no signed approval on that head, and the holder is limited, the PR watcher shall give the task to the other reviewer with status `todo` and the comment "PR watcher: <holder> is parked on a pool wait since <time>, so this review goes to <other> now (HAL-19203):" (or "is at a seat or usage limit since <time>") followed by one line per waiting pull request, at once and at most once per head and reviewer, counting it in the pass summary and the metric `pr_watcher.review_rerouted`; it shall give a task Liam holds to Julian only when Julian didn't write its pull requests and either Liam wrote them or every waiting one is Julian's by `reviewerFor` and isn't a security one, give a task Julian holds to Liam only when Liam didn't write its pull requests, and, when the other reviewer is limited too, leave the task where it is and comment once per head, waking nobody, "PR watcher: both reviewers are limited (…), so this review stays with <holder>:", counting it in the pass summary and the metric `pr_watcher.review_both_limited`.

A reviewer is limited when, among their 20 newest runs in Paperclip, one is in `scheduled_retry` for `ai_connection_pool_wait` with no run of theirs started since it was created, or the newest run stopped with `provider_limit_wait` or `provider_quota` has no run of theirs started since and either its message names a reset time (Paperclip's "expected to reset at <UTC time>", or the provider's "resets <hour>am|pm (UTC)", taken as that hour's first occurrence after the stop) that hasn't passed yet, or it names none and the run stopped less than 5 hours ago (HAL-19254). When a reviewer's runs can't be read, or the plugin's settings name no Paperclip API address or key, nothing moves.

## Examples

- Given pull request 5701 by Mateo, green, unapproved and Julian's by its paths, its task held by Liam, and Liam parked on a pool wait since 16:40 UTC,
  when the watcher runs twice at 17:00 UTC,
  then it gives the task to Julian once, with a comment naming Liam's pool wait since 17:40 CET and #5701, head `5701aaa`.
- Given the same pull request Liam's by its paths,
  when the watcher runs,
  then the task stays with Liam and nobody is woken.
- Given the same task held by Julian, Julian at a usage limit since 16:30 UTC and the pull request Liam's by its paths,
  when the watcher runs,
  then it gives the task to Liam.
- Given Liam parked and Julian at a usage limit,
  when the watcher runs twice,
  then the task stays with Liam and gets one "both reviewers are limited" note.
- Given Liam parked but the pull request approved on its head, a draft, or a red `ci-ok`, or Liam's run working on the task,
  when the watcher runs,
  then nothing moves.
- Given Julian's newest run stopped at 05:00 UTC with `provider_limit_wait`, expected to reset at 05:30 UTC, and no run of theirs started since,
  when the watcher runs at 06:00 UTC,
  then Julian isn't limited; with a reset at 07:00 UTC they are, and with no reset time they are until 10:00 UTC.
- Given Liam's run on the task only queued, and Liam parked,
  when the watcher runs,
  then the task goes to Julian, which cancels the queued run.
