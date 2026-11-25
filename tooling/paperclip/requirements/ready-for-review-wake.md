# paperclip.ready-for-review-wake

- Status: active
- Since: unreleased
- Source: HAL-18980, Track B of the token plan (proposal on HAL-18938): agents called `ready_for_review` again and again with the check's id while a check ran (1,746 calls, about 3% of builder points), so the plugin wakes the agent with the answer instead

When `ready_for_review` would answer `RUNNING` for a branch named `<agent>/<task>-<words>` whose task the calling agent holds, the Agent tools plugin shall keep the check with that task, the agent and the time, replacing a kept check of the same branch, and answer `RUNNING` saying it wakes that task with the answer and not to call again; while a check is kept, a call with its id, or with the same branch and no or the same commit, shall give the same answer without a request to the precheck service; the `precheck-wake` job shall read each kept check every minute and, once the check is done, unknown to the service, or still not done 30 minutes after it was kept, post the answer (`PASS`, `FAIL`, or `CHECK UNAVAILABLE` with the reason) on the task, and stop keeping the check once the answer is posted, then wake the task once with a key per check if the same agent still holds it, where a failure to read the holder or to wake costs only the wake; a check kept for 60 minutes shall be dropped whether or not its answer was posted; a branch without such a task keeps the `RUNNING` answer with the check's id, and a failure to keep or read the kept checks costs the wake, never the answer.

## Examples

- Given a branch `mateo/HAL-1-acme-widget` whose task HAL-1 the calling agent holds, and a check still running after about 6 seconds,
  when the agent calls `ready_for_review`,
  then the answer is `RUNNING` and says the plugin posts the answer on HAL-1 and wakes the agent there.
- Given that kept check,
  when the agent calls again with the same branch, or with the check's id,
  then the answer is the same, and the precheck service gets no request.
- Given a kept check that passes,
  when the job runs,
  then HAL-1 gets one comment starting with the branch and the check's id and holding `PASS`, one wake with the key `ready-for-review <check id>`, and the job's next run sends no request.
- Given a kept check that fails `format`,
  when the job runs,
  then the comment holds `FAIL: format` and the task is woken once.
- Given a kept check still running 30 minutes after it was kept,
  when the job runs,
  then the comment holds `CHECK UNAVAILABLE` saying the check didn't finish within 30 minutes, and the task is woken once.
- Given a kept check that is still running, or a service that can't be reached, before the 30 minutes,
  when the job runs,
  then nothing is posted, nobody is woken, and the check stays kept.
- Given a kept check whose task another agent holds by the time it is done,
  when the job runs,
  then the answer is posted on the task and nobody is woken.
- Given a kept check that passes, and a host that refuses to read the task's holder or to wake it,
  when the job runs twice,
  then HAL-1 gets the answer once, nobody is woken, and the failure is logged.
- Given a kept check whose answer can't be posted, for example because the task is gone,
  when the job runs 60 minutes after the check was kept,
  then the check is dropped with a log line, and later runs send no request.
- Given a branch that names no task, or a task another agent holds,
  when the check is still running after about 6 seconds,
  then the answer is `RUNNING` with the check's id for the next call, as before.
