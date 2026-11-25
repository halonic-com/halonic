# Decision: a task is stuck only after one hour per task its owner holds

- Task: HAL-17732
- Approval: the board asks for this on HAL-17732 (25 Nov comment: make the stuck threshold depend on the owner's load; no flag for a task with an open pull request, a blocker or a pending review). Liam signs it as the code reviewer.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:evG8kACKv6Ro+7GMUU2HUcT7ojCoV5CNeI9grFiQmYaZCBy7t/vlL9sYUJ4SNkZMTb81Ubgu55xdza7ip8d0Cg==

## What changes

The board check's stale part no longer calls an agent's todo or task in progress stuck after a
fixed 24 hours untouched. It now waits one hour per open task the owner holds (todo, in progress
or in review), and at least 4 hours. A task with a blocker, or with an open pull request on its
branch in the PR watcher's snapshot, is never stuck. "Untouched" now also reads the task's last
activity, so a new comment or run counts as a touch.

The requirement `paperclip.board-check-stale` is updated to say this. The test "finds an agent's
slow review after 8 hours and a stuck task after 24" is renamed to "... after 4" and keeps all its
checks, plus one for a task untouched for 5 hours. Two tests are added: one for the owner's load
and one for the pull request and blocker. No test was weakened or skipped.

## Why

A builder now holds up to 8 tasks on a 15-minute heartbeat (HAL-17601), so a task sitting a few
hours between runs is normal. Calling it stuck led to nudges that cost runs and helped nobody
(HAL-17756, HAL-17739, HAL-17816 on 25 Nov). The 4-hour floor matches the part's no-owner wait.

## Covers

- paperclip.board-check-stale
