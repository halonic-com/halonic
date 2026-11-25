# ports.team-run-control

- Status: active
- Since: unreleased
- Source: Runs app build plan (HAL-18624), PR 3 plan approved by the maintainer on HAL-18699; design HAL-18594 revision 3 (Stop and Run again); task HAL-18695

The ports package shall have a `TeamRunControl` port, apart from `TeamStatus`, through which Studio's Runs app stops a team agent's run and runs it again. Each call shall take only the run's opaque ID, never the run, so the source checks again before it writes. Stop shall answer stopping or refused, Run again shall answer woken or refused, and the check for offering Run again shall answer offered or not offered, with why. Every reason shall come from a closed set (the run can't be stopped, the task is done, the task is with someone else, the run had no task, not found, not allowed, the source can't be reached), never a source's own text. A check that isn't offered because the task is with someone else may carry that person's display name, never a login, an email or an ID. `TeamStatus` shall stay without a write member.

## Examples

- Given the port's results,
  when a refusal carries a reason that is any string,
  then it doesn't compile.
- Given the port's calls,
  when one is given a whole `TeamRun` instead of its ID,
  then it doesn't compile.
- Given a check that isn't offered because the task moved,
  when its fields are listed,
  then they are the reason, the task's short name and the holder's display name, and nothing else.
