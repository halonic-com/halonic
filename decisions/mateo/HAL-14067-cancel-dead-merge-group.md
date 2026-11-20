# Decision: a merge-group run cancels itself once its group is gone

- Task: HAL-14067
- Approval: the task asks for this change (HAL-14067, from the team check HAL-14061); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zyUYQ9LM1R2891qVcQHRO38rX3Vdc980ub7aOVv2mIC1sfvfkRA4s9ltVCVFvNEjZKQ8pTqrUJiVyR4KHP0bCw==

## What changes

- In `.github/workflows/ci.yml`, the `fail-fast` job ("Cancel the run on the first failure")
  also looks up the run's own `gh-readonly-queue/...` ref on each poll. If GitHub answers 404,
  the group is gone and the job cancels the run, the same way it does for a failed job.
- Any other error from that lookup takes the job's existing backoff. The backoff now resets only
  after a poll where both calls succeed.
- The lookup comes after the "all jobs finished" exit, so a group that merged (GitHub deletes its
  ref after `ci-ok` passes) is never cancelled.
- The job gets `contents: read` for the lookup.

## Why

When a pull request jumps the queue or a group fails, GitHub rebuilds every group behind it
under new refs and deletes the old ones. The old groups' runs keep going and hold runners: at
04:20 UTC on 20 Nov, 21 of 37 pending merge-group runs belonged to deleted groups. They had to
be cancelled by hand, and this comes back on every jump.

To undo: delete the ref lookup from the `fail-fast` step and the job's `contents: read`.

## Tests

No test was weakened or skipped. `ci-ok` and the jobs it lists are unchanged; only a run whose
group no longer exists stops sooner.

## Covers

- .github/
