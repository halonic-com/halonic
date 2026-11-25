# check.ci-label-keeps-ci-ok

- Status: active
- Since: unreleased
- Source: HAL-17992 (a label run hid `ci-ok`, and GitHub refused to queue the pull request); HAL-17672 (adding `fast-track` starts a run)

`.github/workflows/ci.yml` shall not start on a label change: its `pull_request` types shall not include `labeled`, `unlabeled` or `edited`, so a label never starts a run that becomes the pull request's newest `ci.yml` run without a `ci-ok` of its own, which leaves GitHub's required `ci-ok` "expected". When the `fast-track` label is added to a pull request a person opened from a `halonic-com/halonic` branch, `.github/workflows/fast-track-label.yml` shall cancel that head's newest `ci.yml` pull request run if it is still going, and re-run every job of it unless it already passed, so `pick-runner` reads the label and the run can go to the fast pool. That workflow shall have no job named `ci-ok`, check out nothing, and do nothing for any other label, a fork's pull request or a bot's.

## Examples

- Given a pull request with a green `ci-ok`,
  when the `built-on:paperclip` label is added,
  then no `ci.yml` run starts, and `ci-ok` stays green, so GitHub can queue it.
- Given a pull request whose `ci.yml` run is going,
  when the `fast-track` label is added,
  then `fast-track-label.yml` cancels that run, waits until it has stopped, and re-runs every job of it.
- Given a pull request whose `ci.yml` run already passed,
  when the `fast-track` label is added,
  then nothing is re-run.
- Given a pull request a bot opened, or one from a fork,
  when the `fast-track` label is added,
  then `fast-track-label.yml` skips its job.
