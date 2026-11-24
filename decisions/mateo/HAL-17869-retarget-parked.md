# Decision: the retargeted wake also covers tasks in backlog and blocked

- Approval: HAL-17869 (step 2 of HAL-17866)
- Kind: internal

#5737 sat blocked for about 2 hours on 24 Nov with every check green: GitHub moved its base to `main` when the pull request below merged, which doesn't run the ruleset's required note check again. The watcher's retargeted wake didn't fire because the task was in `backlog`, and stacked pull requests' tasks often wait in `backlog` or `blocked`.

The requirement now names the statuses it covers and adds `backlog` and `blocked`, for this one wake only: no done, no other wake, no handoff, no monitor move, and the status changes to `todo` only if Paperclip refuses to wake the task as it is. The watcher stays read-only on GitHub. It still tells the author to close and reopen or push rather than doing it.

## Covers

- paperclip.pr-watcher-retargeted
