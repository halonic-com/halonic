# check.ci-self-hosted-routing

- Status: active
- Since: unreleased
- Source: HAL-14831 (plan, Julian's security review); HAL-15972 (the fast pool); HAL-17463 (every person's pull request, no label)

Where a job in `.github/workflows/ci.yml` can run on our own CI server, its `runs-on` shall be the one routing expression for its runner size (`CI_RUNNER_LARGE` or `CI_RUNNER_SMALL`), which sends the job to the fast pool (`CI_RUNNER_FAST`) only when that variable is set and the event is a pull request from a `halonic-com/halonic` branch whose author is a `User` account whose login doesn't end in `[bot]` and isn't `dependabot`, `renovate` or `renovate-bot`, and to its own size's pool only when that variable is set, the event is listed in `CI_SELF_HOSTED_EVENTS`, and the event is a merge group or a push to `main`; every other job's `runs-on` shall not name the server's variables or labels.

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
- Given a pull request from a `halonic-com/halonic` branch whose author is a `User` account whose login doesn't end in `[bot]` and isn't `dependabot`, `renovate` or `renovate-bot`, and `CI_RUNNER_FAST` is set,
  when the expression is evaluated,
  then the job runs on the fast pool.
- Given a pull request a bot opened (a `Bot` account, a login ending in `[bot]`, `dependabot`, `renovate` or `renovate-bot`), or from a fork, or `CI_RUNNER_FAST` is empty,
  when the expression is evaluated,
  then the job runs on `ubuntu-24.04`.
