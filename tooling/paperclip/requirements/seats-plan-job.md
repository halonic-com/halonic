# paperclip.seats-plan-job

- Status: active
- Since: unreleased
- Source: HAL-16692; wiring the seat forecast (HAL-16026) into the `seats` plugin (HAL-16008); the seat usage forecast on HAL-15997 (document `seat-forecast`, sections 4.4 and 5: plugin state holds only the latest values)

While the `seats` plugin runs, `seats.plan` shall every 10 minutes, for the one company whose settings list the seats, take the moves and the manual reset advice the placement rules propose from the seats' recent readings and where each agent is now; forecast, from the data `seats.forecast` reads, the effect of each move that has a seat to go to and of each advised reset; add the cap advice; keep that plan in the plugin's state; and log how many moves and resets it priced, how many moves had no seat to go to, how many windows the moved agents use that their target seat has no reading for, and the cap advice as the runs cut, the agents cut and whether the cuts are enough, with no seat folder, account, connection id or agent name. It shall propose and change nothing.

## Examples

- Given a made-up seat at 90% of its week with its weekly reset 4 days away and its reset group's manual reset unused, one agent on it, and a pool seat at 10%,
  when `seats.plan` runs,
  then it keeps one move of the agent to the second seat, whose effect ends the first seat's week lower and the second seat's higher, and one reset of the first seat, and logs 1 move and 1 reset priced.
- Given the same seats where only the first one reads a per-model weekly window,
  when `seats.plan` runs,
  then its log counts 1 target seat window without a reading.
- Given the full seat alone,
  when `seats.plan` runs,
  then it prices no move, still prices the reset, and logs 1 move with no seat to go to.
- Given cap advice that cuts 1 run from each of 2 agents and is enough,
  when `seats.plan` logs it,
  then the log says "cut 2 runs for 2 agents, enough to last until the next big refill".
- Given no company whose settings list seats,
  when `seats.plan` runs,
  then it reads and stores nothing.

## Limits

- The cap advice uses its default settings (a big refill gives back at least 50 points, no cap below 1) until the plugin's settings carry them.
- `seats.plan` doesn't post: `seats.check` posts the proposal on the board's task, and the page shows the effects.
