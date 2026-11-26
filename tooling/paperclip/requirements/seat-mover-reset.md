# paperclip.seat-mover-reset

- Status: active
- Since: unreleased
- Source: HAL-19490

When the board sends `POST /seat-mover/seat-reset` to the Agent tools plugin with a seat (a seat readings name in any case, or an AI connection id), the plugin shall find that seat's AI connection, keep the reset time for six hours, and for every agent pinned to that connection read the agent, send its whole `runtimeConfig` back with only `halonicLimitReset` set to that connection and the reset time, read it again and put `heartbeat` back if it changed; leave an agent someone moved off the seat since the list was read; go on with the others when one fails; log the reset and comment it on the log task; and answer each agent's outcome. It shall refuse anyone who isn't a signed-in board user (403), a body without a seat (400), settings without the Paperclip API address and key (503) and a seat it can't find (404), and move nobody in any mode.

While a seat's reset is kept, the `seat-move` job shall treat a reading of that seat taken at or before the reset as no reading, and ignore a `provider_quota` failure on it at or before the reset. In every pass it shall not count a parked run whose retry is already due as parked.

## Examples

- Given two agents on the One seat and one on another seat,
  when the board reports the One seat reset,
  then both agents on it get `halonicLimitReset` with its connection and the time, their heartbeat is kept, and the third agent is untouched.
- Given an agent that moved off the seat after the list was read,
  when the board reports the reset,
  then that agent is answered as `skipped-moved` and not written.
- Given the One seat's reading at 100% from before the reset and a `provider_quota` failure on it from before the reset,
  when the job runs in `act` mode,
  then nobody is moved off the One seat.
- Given a parked run whose retry was made due,
  when the job runs,
  then its agent isn't moved for it.
