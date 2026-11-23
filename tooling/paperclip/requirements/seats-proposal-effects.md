# paperclip.seats-proposal-effects

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, section 4.4), part of the `seats` plugin (HAL-16008)

When the `seats.plan` job proposes moves or manual resets, the seats forecast shall give each proposal its forecast effect, each on its own against today's forecast: for a move, the agent's placement at the move's time ends then and a new one starts on the target seat; for a manual reset, every window of the seat reads 0% at the run's time and keeps its reset time. The effect shall list every window of the seats the proposal touches with its % at reset (P50 and P90) today and with the proposal, and the pool's run-out time (P50 and P90) today and with the proposal. The forecast shall apply nothing.

## Examples

- Given a made-up seat whose weekly window reaches 100% before its reset with two agents on it,
  when one agent's move to an empty seat is forecast,
  then the first seat ends lower at its reset and the empty seat higher.
- Given two moves proposed in one run,
  when they are forecast,
  then each shows its own effect against today's forecast, not the effect of both.
- Given a full seat proposed for its manual reset,
  when the reset is forecast,
  then the pool runs out later than today, or not within two weeks.

## Limits

- A manual reset is taken to empty every window of the seat and keep its reset times; the next reading after a real reset corrects this.
- Effects of several proposals don't add up exactly, because two moves onto one seat share its room.
