# routines.due-exactly-once

- Status: active
- Since: 0.1.0
- Source: new

When ticks arrive late, in any spacing, or twice for the same moment, the routines package shall make a routine with `catchUp: "all"` due at each of its times exactly once across the sequence of ticks that move forward. Runs may repeat only for a repeated tick, with the same key and time, so a caller that starts one run per key and time starts each once.

## Examples

- Given `every: "1h"` with `catchUp: "all"` and ticks at 08:10, 08:10, 11:40 and 11:40, when each is run, then the times 09:00, 10:00 and 11:00 are each due exactly once.
