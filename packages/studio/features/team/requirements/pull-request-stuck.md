# team.pull-request-stuck

- Status: active
- Since: unreleased
- Source: HAL-17630; the board's approval of the phase 2 card (HAL-17544, 24 Nov); Sofia's flows on HAL-17510 (section 2, the six "stuck" rules); Liam's architecture note on HAL-17511 (1.4); the sidebar's Pull requests place and its count, HAL-17515 S0 (HAL-18516).

The Team feature shall count a pull request as stuck when it has been failing or conflicting for more than 1 hour, waiting for review for more than 4 hours (30 minutes with Fast-track), taken out of the queue for more than 1 hour, or in the queue for more than 90 minutes; when it is approved on an older head; or when its task is done or cancelled, or blocked by a task that's done. It shall read the open pull requests of the first source that serves them, with why each is stuck and the task its branch names, and say when nothing serves them, the connection may not read them, or no snapshot has arrived. It shall add the Pull requests place under the sidebar's Team heading, with the number of stuck pull requests as its problems signal, so a day with nothing stuck shows no number.

## Examples

- Given a pull request failing for 61 minutes,
  when its stuck reasons are worked out,
  then it is stuck as failing; at 60 minutes it isn't.
- Given a Fast-track pull request waiting for review for 31 minutes,
  when its stuck reasons are worked out,
  then it is stuck; without Fast-track it isn't until after 4 hours.
- Given a pull request approved on an older head,
  when its stuck reasons are worked out,
  then it is stuck at once.
- Given a pull request whose task is blocked by a task that's done,
  when its stuck reasons are worked out,
  then it is stuck.
- Given a Studio where nothing serves `TeamStatus`,
  when a workspace opens,
  then it opens, and the pull requests read as not available.
- Given two open pull requests, one failing for 61 minutes and one for 5,
  when the sidebar shows Pull requests,
  then its signal is 1, heard as "1 problem".
