# paperclip.seat-mover-not-connected

- Status: active
- Since: unreleased
- Source: HAL-19394; Julian's review of #6452 (HAL-19464)

The Agent tools plugin's seat mover shall move an agent off a seat whose AI connection has an explicit status other than `connected` (such as expired or revoked), paused or not, as it does for an excluded seat or the paid API, and never send an agent to such a seat; an agent no seat may take stays where it is and is listed as stuck. A connection with no status shall count as unknown: the seat mover sends nobody to it and moves nobody off it.

## Examples

- Given an agent on a seat whose connection was revoked and a legal seat at 30%,
  when the seat mover plans,
  then the agent moves to the seat at 30%.
- Given an agent on a seat whose connection was revoked and no legal seat,
  when the seat mover plans,
  then it moves nobody and lists the agent as stuck.
- Given an agent on a seat whose connection has no status, and another agent leaving a full seat,
  when the seat mover plans,
  then the first agent stays and the second is sent to another seat, not the one without a status.
