# Decision: pr.read retries GitHub server errors

- Task: HAL-7532
- Approval: Mateo reviewed and approved it on HAL-7542, Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QLU/d4T4jPGoQ97w60sntUYIuACpzm/gF4oLQAc3HuqvbP0SePABLFAis7FnJc6AOr28ZhIfDVvsdBTAZl6bBw==

## What changes

Only `.github/actions/pull-request/action.yml`. `pr.read` now also retries a GitHub server error (a 5xx, a reply that isn't JSON, or an empty reply) after 5 s, 15 s and 30 s, inside the existing `BUDGET`. A 4xx such as 404 or 401 still fails at once, and rate limits keep their HAL-5172 handling.

## Why

Four merge-queue runs dropped at 13:37–13:39 UTC on 12 Nov because GitHub answered with a 5xx page. A short retry lets those runs go on instead of failing the merge group.

No check, workflow trigger, permission or setting changes.

## Covers

- .github/
