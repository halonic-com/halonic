# Decision: the "request started" toast gets Open run

- Approval: Open run on the toast is in the board-approved flow-inbox, section 2 (Toasts: "Support reply started · Open run", microcopy 10.3, HAL-877); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-1305 (part 4)

## What changes

`inbox.request`: after **Send** starts the workflow, the toast "*label* started" has **Open run**, which opens that run's page. `InboxRequests.start` now returns the run's hub with its id, because a run's page is opened by both. Nothing was removed or weakened.

## Why

The approved flow puts Open run on this toast, and it was missing, so a person who started a request had no way from the toast to follow the run.

## Decided by the team

- Open run shows only where the window can open a run. A window that can't shows the toast without the button, so it never offers a link that does nothing.

## Covers

- inbox.request
