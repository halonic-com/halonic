# paperclip.board-check-failed-runs

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 1 part (a), with Liam's conditions on HAL-16192 and Mateo's answers on HAL-16193 (22 Nov)

When Paperclip reports an `agent.run.failed` event, the Agent tools plugin's board check shall keep the run for 48 hours as its run, agent and task ids, its time and one cause code (`no_identity`, `spend_limit`, `timeout`, `adapter_error` or `other`) read from its status and error, and keep no error text; and in each 10-minute pass it shall wake, through the write gate and within the wakes the ceiling leaves after a board ask's wake, the task of each run without a GitHub identity once per task, and put one line naming the count, the first time and the agents of new spend-limit failures on the Seat Supervisor's task when the settings name it.

## Examples

- Given two runs on HAL-1 that failed with "No managed GitHub identity is available" and a made-up token in the error,
  when the job runs twice,
  then the plugin wakes HAL-1 once, and the token and the error's words appear nowhere it writes, logs or keeps.
- Given six tasks whose runs had no GitHub identity and one new board ask,
  when the job runs twice,
  then the first pass wakes the Board Checker and four of the tasks, and the second the other two.
- Given a run that failed with "Spend limit reached" and the Seat Supervisor's task set,
  when the job runs twice,
  then the plugin comments "Spend-limit failures: 1 runs since …" once on that task.
- Given a run that timed out, one whose adapter exited with code 137, and one with an unknown error,
  when the plugin keeps them,
  then their causes are `timeout`, `adapter_error` and `other`.
