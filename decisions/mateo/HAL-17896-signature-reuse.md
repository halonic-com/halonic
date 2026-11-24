# Decision: a push that only signs the decision note reuses the previous head's CI results

- Task: HAL-17896 (the CI part of HAL-17893, under HAL-17891)
- Approval: Chief decided on HAL-17893 (24 Nov) that Liam owns the sign-with-the-review flow and Mateo the CI part; HAL-17896 specifies this change, and Liam signs this note in review
- Kind: internal

## What changes

- `.github/workflows/ci.yml`: a new job, `signature-reuse` ("Signature-only push"), on
  `ubuntu-24.04`. The job runs wherever `changes` runs, because a skipped need of `changes` would
  skip every job below it that has no status check; its steps run only for a pull request's
  `synchronize` that isn't a draft and while the repo variable `CI_PR_SIGNATURE_REUSE` isn't `off`,
  and `ci-ok` needs it. It runs `infra/ci-runner/signature-reuse.mjs` and
  answers the id of the run whose results can be reused, or nothing. Its step never fails.
  `changes` needs it (with `!cancelled()`, so it still runs if the job breaks) and passes its
  answer on as `reuse`. On a reuse the build shards skip (`build` needs `signature-reuse`), and so
  do the merge base's tests and every area job (scaffold, end-to-end, docs, Tauri, sandbox,
  installer, Android, agent host, WSL). The fast gates, leak and secret scans, workflow lint,
  policy rules, coverage floors and live-cloud gate still run.
- The requirement guard job takes its merge base (sha, built-on, result archive id and sha256)
  from `signature-reuse` on a reuse and from `base-tests` otherwise, downloads both sides' test
  results from the reused run (`actions: read`), and tests the new head merged into the reused
  run's `main` commit (`git merge-tree`), so it compares like with like when `main` moved. It
  still runs the merge base's copy of trace and the guard, which verifies the new signature.
- `base-tests` writes its outputs as a notice ("Merge base's results"), because another run can't
  read a job's outputs.
- The fail-fast job no longer cancels a pull request's run when the full requirement guard fails
  (its file checks job already didn't, HAL-17892), so the other jobs finish and a signature-only
  push can reuse them. This edits
  `check.ci-pr-fail-fast` and its test.
- `infra/ci-runner/signature-reuse.mjs` (new) and its test (new, in the fast gates' infra
  tests). It reuses only when the new commit's only parent is the previous head, it changes only
  `decisions/<head ref>.md`, every added or removed line there matches `^- Signature: ed25519:`,
  and the previous head's newest completed full run (a `ci-ok` job by that name; not the label
  run) passed every job but `ci-ok`, the fail-fast job and the requirement guard's two jobs (its file checks, HAL-17892, and the full guard), with its
  results not expired. A previous run that was itself a reuse points at the run it reused. A
  re-run (attempt 2), a draft, a missing `before`, any API error or odd answer means a full run.
- New requirement `check.ci-pr-signature-reuse` and its wiring test. `ci-self-hosted-routing`
  and `guard-walk-back` tests follow the new conditions and step names; nothing is weakened.
- `docs/guides/checks.md`: a paragraph in the CI section on when a push reuses results and how
  to force a full run, and the fail-fast row.

## Why

44% of red pull request runs fail only because the note isn't signed yet (HAL-17891). The
signature covers the note without its signature lines and the covered files' git objects, not
the head commit, so a signature-only push changes nothing the build or the tests read, and a
full ~15 minute run for it is waste.

## Security

Not a trust boundary: a pull request runs its own copy of `ci.yml` and of the helper anyway. The
merge queue still runs every job, and `guard-notes.yml` (the base's code) still checks the note.

## Covers

- .github/
- tooling/check/
- check.ci-pr-fail-fast
