# Decision: a merge's preview build clicks through the short check plus only the steps its change touched

- Approval: the task asks for this change (HAL-18863, point 3 of the click-test plan the board
  approved on HAL-18716); Liam approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vugASYgydY1QVZy1OWXdugf5onpzIXEHFV07UNeu1UZeYhr2K+b+eHy7cg7TW3eK00tWUx7GWQg3RCg6vWJJCw==

## What changes

`.github/workflows/studio-preview.yml`, `click-test` job: a new step, on push builds only, "List
what changed since main's last green build". It reads the `head_sha` of the newest successful push
run of `studio-preview.yml` on `main`, fetches that commit and the build commit at depth 1, and
writes `git diff --name-only --no-renames` of the two to a file named by `CLICK_TEST_CHANGED`, with
the base in `CLICK_TEST_SINCE`. With no green run yet, it sets neither, and every step runs. The
job's permissions don't change (`contents: read`, `actions: read`); the fetch uses no credential.

The suite (`packages/testing/studio-click-test`) then runs the short check ("The engine answers"),
each step whose requirement files, requirement folders or own step file the change touched, and
the steps those need. A change to the suite's other code or to `studio-preview.yml` runs every step,
as do the nightly run and a run by hand, which set no list. The results table names the steps a
build left out. New requirement `studio-click-test.affected-steps`, with tests. No requirement or
test is edited or removed.

## Why

The board approved running only the affected steps per build, with the full suite nightly
(HAL-18716). The base is the last green build rather than the previous commit, so a build that was
replaced while waiting, or failed, leaves no change untested by the next one.

## Covers

- .github/
