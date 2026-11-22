# deploy.plan

- Status: active
- Since: unreleased
- Source: HAL-6702; build plan, the target's `deployTarget` export; deploy flow 2.7, 3.7 and C4 (HAL-6687)

The target's `plan` shall measure a deploy against what's live and change nothing: it shall take no lock, apply no database change and create, upload or write nothing. It shall list what a deploy would create, a Worker as a `service`, and the ids of the database changes it would apply, every one of them when the database doesn't exist yet. It shall give the live version, numbered as `status` numbers it, the address when there is one, and who holds the lock, read as `deploy.lock-read` reads it. A lock that can't be read for any other reason than a missing database or table shall fail the plan rather than say no one holds it. It shall say a deploy is `unchanged` only when the live version's commit and Halonic version are both the snapshot's; while the live version's Halonic version and reaches are unknown, it shall say neither is the same, so a deploy counts everything as new.

Rationale: the command shows the plan before it asks anything (flow 2.7), names a running deploy first (3.7) and asks again only for what's new against the live version (C4); a plan that guessed would skip a question the user must answer.

## Examples

- Given an account with nothing deployed, when `plan` is called, then it lists the database, both buckets and the Worker as created, and every database change, and nothing is written.
- Given version B live from the snapshot's commit, with no Halonic version known, when `plan` is called, then B is live as number 2 and the plan isn't `unchanged`.
- Given a lease held by kim@example.com, when `plan` is called, then `lockedBy` names kim@example.com and no lock call writes.
- Given a lock read that fails, when `plan` is called, then it rejects with the port's failure.
