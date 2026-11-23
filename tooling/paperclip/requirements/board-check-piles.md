# paperclip.board-check-piles

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 1 part (a) ("Run piles of 5+ queued for one agent, read through `issue.subtree.read`: one line"), with Mateo's answer on HAL-16193 (22 Nov)

When the board check runs its first pass of each hour, the Agent tools plugin's board check shall read, through `issue.subtree.read`, the queued and running runs of each open task the pass's listing shows with an active run, at most 60 tasks a pass, count each agent's queued runs once per run, and, through the write gate, put one line on the Board Checker's task naming every agent with 5 or more queued runs and their counts when an agent has a pile not yet reported, where a line the gate only logged doesn't count as reported, reporting an agent again only after its queue dropped under 5; it shall keep the count, as agent ids, counts and a time, for `failed_runs`, which adds the piles as one line.

## Examples

- Given Ravi with 6 queued runs spread over three tasks and Liam with 4,
  when the job runs on the hour twice,
  then the plugin comments "Queued runs piling up (5 or more for one agent): Ravi 6." once on the Board Checker's task.
- Given Ravi's pile was reported and Ravi's queue then dropped to 2,
  when it grows to 5 again,
  then the plugin reports Ravi again.
- Given Ravi with 6 queued runs and an hourly pass at 14:00 with writes off,
  when the board turns writes on and the job runs at 15:00,
  then the plugin names Ravi's pile once.
- Given a pass 20 minutes past the hour,
  when the job runs,
  then the plugin reads no task's runs.
- Given a reported pile,
  when an agent calls `failed_runs`,
  then the result ends with "Queued piles at …: Ravi 6.".
