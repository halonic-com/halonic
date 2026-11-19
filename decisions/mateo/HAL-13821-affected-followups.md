# Decision: affected tests follow-ups from the #3694 review

- Task: HAL-13821
- Approval: the non-blocking points Liam and Julian raised on #3694 (HAL-12539, step 1b). `tooling/check/src/lib/affected-tests.ts` is a guard trust root, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:iMHLWC8sTsikjB7P7sIivEea/O6/xUPxlp9kMv1G2xXBp9Ov4ZjybFA+sQDzeqHOViJiKGH3BIqmVEEFCrruCQ==
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:899daxBhg5k3r8WJSlqbtuwoLsOtLHwkKTL49jkMWgwKh+x1Ca/+X4uqKeUZsonMAuqxVOPEzXsjzre5RrPsDw==

## What changes

- `tooling/check/src/lib/affected-tests.ts`: `selectTests` passes the changed files to
  `verifierPackages`, which adds their requirement files to the "which package owns this
  requirement" map. A requirement's package comes from its path, so this gives the links of
  both sides of the change, whichever side is checked out. Before, a pull request that deleted a
  requirement lost the link to a package whose tests still name it, without depending on it,
  and the scoped trace missed it. A test file whose `verifies()` calls differ between the sides
  has changed itself, so its package is selected anyway.
- `docsReaders` lists the docs that tests read: `docs/guides/integrations.md` (format),
  `docs/guides/area-owners.md` and `docs/legal/dco-standing-statement.md` (tooling-check). A
  change to one selects those packages, as `examples/` does. A test reads the real repo and
  fails when a test reads a doc by a path out of its package that the list doesn't name.
- `.github/workflows/ci.yml`: after the lockfile walk-back, the merge base's tests now run every
  package, as after the test walk-back. Before, the older commit's copy of affected-tests chose
  the packages, while the comment said the walk-back tests everything. That could only fail the
  guard, never pass it wrongly, but now the comment and the job agree.

## Why

Liam's points 1 and 2 and Julian's docs point in the #3694 review. None of them could let a
pull request through wrongly in the merge queue, which still tests everything and runs the full
trace, but each one made a pull request's own run check less than it should.

## Tests

No test was weakened or skipped. New tests cover the deleted requirement, a doc change, the
docs list against the real repo, and the walk-back in `ci.yml`.

## Covers

- .github/
- tooling/check/
- check.affected-tests
