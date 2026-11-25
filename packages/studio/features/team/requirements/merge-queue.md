# team.merge-queue

- Status: active
- Since: unreleased
- Source: HAL-18341 (from Noah's visual check on HAL-18301); Sofia's flows on HAL-17510 (2.1, 2.3); Noah's `wording` table on HAL-17515 (P1–P9, P10, P18–P22).

The Pull requests screen shall show the merge queue's health in one line under the tabs, a Queue tab with the queue's groups in order, the pull requests waiting to enter and those taken out today, and a Merged today tab with the pull requests merged in the last day, newest first, in the words of the HAL-17515 table. It shall show only positions and times the source sent, never a guessed time to merge, and shall say "The merge queue is empty." when nothing is in it.

## Examples

- Given a running queue with 7 pull requests whose second of three groups is building and no runner wait,
  when the screen opens,
  then the line under the tabs says "Merge queue: Running · 7 PRs · group 2 of 3 building · no runner wait".
- Given a queue whose runners have kept pushes waiting 12 minutes,
  when the screen opens,
  then the line says "Merge queue: ⚠ Runners busy · longest wait 12 min · pushes are on hold".
- Given a queue with nothing in it,
  when the Queue tab opens,
  then it says "The merge queue is empty." and that approved pull requests with a green ci-ok show up there once the queue session adds them.
- Given two pull requests merged at 11:05 and 12:40,
  when the Merged today tab opens,
  then "Merged 12:40" comes before "Merged 11:05".
