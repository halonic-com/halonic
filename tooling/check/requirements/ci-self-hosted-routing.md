# check.ci-self-hosted-routing

- Status: active
- Since: unreleased
- Source: HAL-14831 (plan, Julian's security review); HAL-15972 (the fast pool); HAL-17463 (bots refused); HAL-17616 (the `fast-track` label again); HAL-17654 (the fast pool only while it has room); HAL-17672 (adding the label starts a run)

Where a job in `.github/workflows/ci.yml` can run on our own CI server, its `runs-on` shall be the one routing expression for its runner size (`CI_RUNNER_LARGE` or `CI_RUNNER_SMALL`), which sends the job to the fast pool (`CI_RUNNER_FAST`) only when that variable is set, the event is a pull request from a `halonic-com/halonic` branch, the `pick-runner` job answered `fast` for the run, and the pull request's author is a `User` account whose login doesn't end in `[bot]` and isn't `dependabot`, `renovate` or `renovate-bot`, and to its own size's pool only when that variable is set, the event is listed in `CI_SELF_HOSTED_EVENTS`, and the event is a merge group or a push to `main`; every other job's `runs-on` shall not name the server's variables or labels. The `pick-runner` job shall run only for such a pull request, and shall answer `fast` only when the pull request is in `CI_FAST_SCOPE` (`all`, or by default only one labelled `fast-track`) and GitHub lists at least `CI_FAST_MIN_IDLE` (14 when unset) online, idle runners in `CI_RUNNER_FAST`'s group with all of its labels; on any error it shall answer GitHub's runners.

When the `fast-track` label is added to a pull request, `ci.yml` shall start a pull request run, which the routing expression above sends to the fast pool under the same conditions. When any other label is added, `ci.yml` shall skip every job, report `ci-ok` under another name, cancel no run of that pull request, and name its run "A label was added: nothing to run", which `pr-details.yml` and `live-cloud-gate.yml` pass over when they look for the pull request's newest run. Removing a label shall start no run.

## Examples

- Given the `build` job,
  when its `runs-on` is read,
  then it is the expression for `CI_RUNNER_LARGE`, character for character.
- Given the `trace` job,
  when its `runs-on` is read,
  then it is the expression for `CI_RUNNER_SMALL`.
- Given the `changes` job, which the end-to-end job waits for,
  when its `runs-on` is read,
  then it is `ubuntu-24.04`.
- Given the `leaks` job, which holds the leak guard's secret,
  when its `runs-on` is read,
  then it is `ubuntu-24.04`.
- Given a merge group or a push to `main` while `CI_RUNNER_LARGE` is empty, or a push to a `release/**` branch,
  when the expression is evaluated,
  then the job runs on `ubuntu-24.04`.
- Given a pull request from a `halonic-com/halonic` branch whose author is a `User` account whose login doesn't end in `[bot]` and isn't `dependabot`, `renovate` or `renovate-bot`, `CI_RUNNER_FAST` is set, and `pick-runner` answered `fast`,
  when the expression is evaluated,
  then the job runs on the fast pool.
- Given `pick-runner` didn't answer `fast` (skipped, failed, out of scope or too few idle runners), or a pull request a bot opened (a `Bot` account, a login ending in `[bot]`, `dependabot`, `renovate` or `renovate-bot`), or from a fork, or `CI_RUNNER_FAST` is empty,
  when the expression is evaluated,
  then the job runs on `ubuntu-24.04`.
- Given `CI_FAST_SCOPE` is unset or `fast-track` and the pull request has no `fast-track` label,
  when `pick-runner` runs,
  then it answers GitHub's runners without asking GitHub about the pool.
- Given a labelled pull request and 13 idle fast runners with `CI_FAST_MIN_IDLE` unset, or an API call that fails,
  when `pick-runner` runs,
  then it answers GitHub's runners.
- Given an open pull request whose run is in progress,
  when the `fast-track` label is added,
  then a new run starts and replaces it, and its jobs are routed as for any pull request run with the label.
- Given an open pull request whose run is in progress,
  when the `built-on:paperclip` label is added,
  then a run named "A label was added: nothing to run" starts in a concurrency group of its own, every job but `ci-ok (label added, nothing to run)` skips, and the run in progress goes on.
