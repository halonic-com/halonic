# Decision: Pull requests in the sidebar's Team group, with the stuck PRs as its count

- Task: HAL-18516
- Approval: Liam approves this change on HAL-18516 when he reviews the pull request. The place, its name, its icon and its count are the board-approved phase 2 design (HAL-17544, HAL-17515 S0), so no board card.
- Kind: user-visible

## What changes

The requirement shell.sidebar-places gains a tenth place, Pull requests, in the Team group right
after Spend and seats, with a new example and tests; nothing it already said is weakened or
removed. The requirement team.pull-request-stuck (not released yet, `Since: unreleased`) gains
the sidebar place and its signal, the number of stuck pull requests, with an example and a
`verifies` test. The kit's place icons gain `pull-requests`, drawn from the HAL-17515 mockup kit.
No test was weakened or skipped.

## Why

#6032 and #6039 built the Pull requests screen, but no feature added its place, so users could
not open it (found by the changeset check on HAL-18510).

## Covers

- shell.sidebar-places
- team.pull-request-stuck
