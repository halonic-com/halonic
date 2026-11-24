# Decision: adding the fast-track label starts a CI run; any other label starts one that does nothing

- Task: HAL-17672 (the board's request on the task, 24 Nov)
- Approval: the board asked on HAL-17672 (24 Nov ~17:35 Spain) for a `labeled` trigger in `ci.yml` that starts a run only for `fast-track`; Liam signs this note in review. The hook and the gate don't change, so Julian's C1–C8 check isn't needed
- Kind: internal
- Signature:

## What changes

- `.github/workflows/ci.yml`:
  - `pull_request` gets the `labeled` type; `unlabeled` and `edited` stay out.
  - A `labeled` event for any label but `fast-track` (the "label run") gets:
    - a concurrency group of its own run (`ci-label-<run id>`), so it never cancels the pull
      request's run. A `fast-track` label joins the pull request's group and replaces the run in
      progress, like a push;
    - the run name "A label was added: nothing to run" (`run-name:`; blank, so GitHub's own name,
      for every other run);
    - `changes`, `leaks`, `coverage-floors`, `gitleaks`, `live-cloud`, `policy-base`, `fast` and
      `build` skip (their condition holds
      `(github.event.action != 'labeled' || github.event.label.name == 'fast-track')`); every other
      job skips with them, because it needs one of them, or asks for a `changes` output, or never
      runs for a pull request;
    - `ci-ok` still runs and passes, but under the name `ci-ok (label added, nothing to run)`.
  - The comment at the top says that adding the label starts a run.
- `.github/workflows/pr-details.yml` and `.github/workflows/live-cloud-gate.yml`: where they take
  the pull request's newest `ci.yml` run, they pass over a run with the label run's name.
- The requirement `check.ci-self-hosted-routing`: a new paragraph and two examples for the
  label runs.
- `infra/ci-runner/README.md`: "adding the label starts a run", instead of "the next push does".
- No change to the hook (`vm/job-started.sh`) or the gate. The hook reads the event's pull request
  number and head commit and the workflow ref. A `labeled` run has the same ones as a push's run
  (`ci.yml@refs/pull/<n>/merge`), and the hook asks the gate about the pull request as it is when
  the job starts (open, our own branch, at that commit, labelled `fast-track`, opened by a person),
  whatever event started the run.

## Why

A pull request that gets `fast-track` kept running on GitHub's runners until its next push.
Re-running doesn't help: a re-run reuses the old event, which has no label, so the routing still
sends it to `ubuntu-24.04`. A `labeled` event carries the pull request's labels, the new one
included, so its run is routed to the fast pool at once.

Every label change starts a `ci.yml` run once `labeled` is a trigger, and GitHub has no filter by
label name. So the other labels get a run that does nothing and touches nothing:

- **Its own concurrency group:** in the pull request's group it would cancel the run in progress.
  This matters most for `built-on:paperclip`, which `gh pr create --label` adds right after
  `opened`.
- **`ci-ok` under another name:** a skipped required check counts as passed, and a green one from
  a run that tested nothing would stand in for the real run's result. Under another name it can't.
  It runs instead of skipping because the name is certain to be evaluated for a job that runs.
- **A fixed run name:** `pr-details.yml` re-runs CI's failed title, leak and coverage-floor jobs
  after a label change (for example `coverage-floor-lowered`), and `live-cloud-gate.yml` re-runs
  the live cloud gate. Both took the newest `ci.yml` run on the head, which would now be the label
  run, so the re-run would never happen. They pass it over by its name. A pull request can't take
  that name as its title, because the title check wants `type(scope): summary`.

What stays: the label run's other jobs show as skipped among the pull request's checks. The
required check is `ci-ok` alone, so this changes nothing that blocks or admits a merge. When
`CI_RUNNER_FAST` is empty, adding `fast-track` still starts a run, on GitHub's runners. That's
rare and harmless, and keeping the skip to the label name keeps the condition short.

## Tests

No test was skipped or weakened. Three new tests in the routing test
(`tooling/check/src/test/ci-self-hosted-routing.test.ts`):

- the triggers include `labeled` and not `unlabeled`, and the run name and the concurrency group
  for a label run;
- every job skips in a label run: each one holds the condition, needs a job that does, asks for
  an output of `changes`, or never runs for a pull request. `ci-ok` reports under another name;
- `pr-details.yml` and `live-cloud-gate.yml` pass the label run over.

`pnpm exec vitest run` on the routing, desktop-hourly, main-skips-merged and pr-areas tests: 19
pass.

## Covers

- check.ci-self-hosted-routing
- .github/
- tooling/check/
