# team.pull-request-detail

- Status: active
- Since: unreleased
- Source: HAL-17745 (split from HAL-17630); Sofia's flows on HAL-17510 (2.2); Noah's `wording` table on HAL-17515 (flow 2, P12–P17); Liam's carry-overs on HAL-17745 (Open in GitHub for a PR with a task).

When a person presses a pull request's title on the Pull requests screen, the screen shall show that pull request's page: its author, task and size, its state in the words of the HAL-17515 table, since when it is stuck, its Review, Queue and Task facts, its timeline oldest step first with each step's words as plain text, and the hint that nothing merges, queues, labels, approves, closes or reruns from there. It shall open only a link that `isAllowedWebLink` passes, showing its full address first, and Back shall return to the list it came from with focus on that title.

## Examples

- Given a pull request failing on typecheck since 11:00 whose timeline has the step `[x](javascript:alert(1))`,
  when its page opens,
  then it says "Stuck since 11:00" and the step shows as typed, with no link.
- Given a pull request in the queue at place 1 of 2 in group 1,
  when its page opens,
  then the Queue fact says "1 of 2 · group 1".
- Given a pull request with a task and a GitHub link,
  when its page opens,
  then it offers "Open in GitHub ↗" with the full link next to it.
