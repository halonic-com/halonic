# team.notices

- Status: active
- Since: unreleased
- Source: HAL-17638; the board's approval of the phase 2 card (HAL-17544, 24 Nov), Choice S3 (80% is a quiet Inbox notice); Noah's HAL-17515 `wording`, S19; Liam's architecture note on HAL-17511 (1.4).

The Team feature shall work out one Inbox notice for each seat at 80% of its week or more, reaching 90% within an hour, full or signed out, in HAL-17515's S19 words, from the seats as they are now. A seat's notice shall keep the seat's ID as it changes, so it updates in place, and shall be gone once the seat has no problem. Only the 80% notice shall be quiet.

## Examples

- Given Seat B at 80% of its week, resetting Thu 09:00,
  when the notices are worked out,
  then one quiet notice says "Seat B has used 80% of its week" and "Resets Thu 09:00".
- Given that notice, when Seat B reaches 90%,
  then the same notice, by ID, says "Seat B has used 90% of its week".
- Given that notice, when Seat B drops to 70%,
  then there is no notice for Seat B.
