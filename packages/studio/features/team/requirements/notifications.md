# team.notifications

- Status: active
- Since: unreleased
- Source: HAL-17638; the board's approval of the phase 2 card (HAL-17544, 24 Nov), Choices S3 and T3; Noah's HAL-17515 `wording`, S20; Liam's architecture note on HAL-17511 (1.4).

When `TeamStatus` reports a change, the Studio shall read the seats and merge queues again and show one desktop notification, through the notification service and its quiet hours, for each seat that goes into 90% of its week (or reaching it within an hour), into full or signed out, and for each merge queue whose runners have been busy for 5 minutes or more, in HAL-17515's S20 words. It shall show none for a seat that only goes into 80%, none for a change that keeps the same problem, and none for what is there when it starts.

## Examples

- Given Seat B at 84%, when it is full until Thu 09:00 with 2 agents,
  then one notification "Seat B is full until Thu 09:00" with "2 agents still on it" shows.
- Given that notification, when Seat B is read again and is still full,
  then no notification shows.
- Given quiet hours from 22:00 to 07:00, when Seat D signs out at 03:10,
  then nothing shows until 07:00, and then one summary shows.
- Given a merge queue whose runners have been busy for 12 minutes with 7 pull requests,
  then one notification "Runners busy · pushes are on hold" with "Longest wait 12 min · 7 PRs in the queue" shows.
