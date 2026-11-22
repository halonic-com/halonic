# paperclip.seats-placements

- Status: active
- Since: unreleased
- Source: HAL-16008; placement history for the seat forecast on HAL-15997, recorded as the plugin sees each change because Paperclip keeps no readable history of agent settings

When the `seats` plugin compares the open placements with the agents' seats now, it shall end each placement whose agent moved, left its seat or is gone, and start one for each agent on a seat it has no open placement for, both at the same time and with the given source.

## Examples

- Given an agent still on its seat,
  when the placements are compared,
  then nothing changes.
- Given an agent moved from seat A to seat B,
  when the placements are compared,
  then its placement on A ends and one on B starts at the same time.
- Given an agent that is gone from the agents,
  when the placements are compared,
  then its placement ends.
