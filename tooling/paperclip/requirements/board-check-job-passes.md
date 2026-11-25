# paperclip.board-check-job-passes

- Status: active
- Since: unreleased
- Source: HAL-18857 (the missed-pass alert for board.check)

When a pass of the Agent tools plugin's `board-check` job finishes for a company, the plugin shall save the metric `board_check.job_passes` with value 1 and the tags `companyId` and `trigger: job`; a pass started by a comment event, and a job pass that fails before it finishes, shall save no `board_check.job_passes`.

## Examples

- Given a company whose settings name the Board Checker's task,
  when the job runs once,
  then the plugin saves `board_check.job_passes` 1 for that company.
- Given a new comment,
  when its event pass runs,
  then the plugin saves no `board_check.job_passes`.
- Given a job pass whose comment reads fail,
  when it runs,
  then the plugin saves no `board_check.job_passes`.
