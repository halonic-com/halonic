# paperclip.queue-prio

- Status: active
- Since: unreleased
- Source: HAL-16004; the critical-path order from HAL-14892 and aging from HAL-14388 (22 Nov), phase 1 of the supervision plan on HAL-15997

When the merge queue's fill order is worked out, `queue.prio` shall score each ready pull request on `halonic` as 100 for each open pull request stacked on it, plus 10 for each open task whose "blocked by" field names its task, plus its task's priority (critical 4, high 3, medium 2, low 1), plus 1 for each full 2 hours since it became ready (at most 24), and order them highest score first, then oldest ready, then lowest number, using only the facts it is given.

## Examples

- Given a pull request with one pull request stacked on it and another whose task blocks three open tasks,
  when they are ordered,
  then the stacked-on one comes first (100 against 30).
- Given a task that blocks a done task and an open one,
  when its pull request is scored,
  then only the open one counts (10).
- Given a pull request that blocks nothing and has been ready for 7 hours, and one ready for 100 hours,
  when they are scored,
  then aging adds 3 and 24.
- Given two pull requests with the same score,
  when they are ordered,
  then the one ready longer comes first, and with the same ready time the lower number does.
