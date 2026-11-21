# Decision: built-on-label reads the pull request's current labels

- Task: HAL-14946
- Approval: Liam approves this note in review on HAL-14946
- Kind: internal

## What changes

In `.github/workflows/built-on-label.yml`, the job no longer reads the labels from the event
payload. It reads the pull request's current labels with `gh api repos/<repo>/pulls/<n>`. The job
gains a `pull-requests: read` token for that call; it still checks out nothing and runs nothing
from the pull request. The merge-queue path doesn't change: it still passes, because the label was
checked on the pull request. `docs/guides/checks.md` says a re-run reads the current labels.

## Why

A re-run replays the original `opened` or `synchronize` event. A run that failed before the label
was added read no labels on re-run and failed again, which left a red run on the head that the
queue session's gate counts (#4239, #4254, #4259, #4260; HAL-14937, option 3, decided by Chief).
The check itself is unchanged: a pull request without `built-on:paperclip` or `built-on:halonic`
still fails.

## Covers

- .github/
