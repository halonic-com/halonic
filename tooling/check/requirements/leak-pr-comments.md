# check.leak-pr-comments

- Status: active
- Since: unreleased
- Source: HAL-20064 (decision on HAL-20058)

When the daily run of `scheduled.yml` runs, it shall scan the bodies, comments, review bodies and review comments of pull requests updated since the newest run whose scan succeeded (every pull request when there is none, or when a manual run asks for a full scan) for the personal terms of the `leak-terms` environment, never a list in the repo. It shall skip texts written by a login in the `HALONIC_BOARD_LOGINS` secret of that environment. On a hit it shall open one issue titled "Personal terms in pull request comments", or comment on the open one, listing only pull request numbers and links to the texts, never the matched text. When the terms are not set, it shall pass with a notice.

## Examples

- Given a comment on pull request 7 that holds a term,
  when the scan runs,
  then the issue lists #7 with a link to that comment, and not the comment's text.
- Given a review by a board login that holds a term,
  when the scan runs,
  then it reports nothing.
- Given the last run's scan failed and the one before succeeded,
  when the scan runs,
  then it reads what was updated since the one before started.
- Given `HALONIC_DENY_TERMS` is not set,
  when the scan runs,
  then it passes with a notice.
