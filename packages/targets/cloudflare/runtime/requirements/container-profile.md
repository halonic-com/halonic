# runtime.container-profile

- Status: active
- Since: unreleased
- Source: HAL-18179 (B1b-1 of the plan on HAL-18020), design approved on HAL-18239

The Worker shall build the sandbox profile of a harness step in the run's container with fixed container folders: `/work` to work in, `/halonic/temp` for temp files and `/halonic/home/.claude` for the agent's settings. It shall open the run's instructions folder read-only, and refuse one that isn't an absolute container path without `.` or `..` parts. Its network shall reach the bridge only by the name `bridge.halonic.invalid`, over plain HTTP, and refuse any other bridge address, plus the sites the agent's file allows and no others. Its time limit shall be the run container's time cap, which ends a minute before Cloudflare's 15-minute limit on a Durable Object's alarm.

Rationale: a harness step runs inside its run object's alarm, so its container must stop before the alarm is cut off, and the container must reach nothing but its own run's bridge and the agent's sites.

## Examples

- Given the agent `writer` whose file allows `registry.npmjs.org`, when its profile is built with the bridge `http://bridge.halonic.invalid`, then the program works in `/work`, reaches the bridge by name and `registry.npmjs.org`, and runs for at most 14 minutes.
- Given a bridge at `http://127.0.0.1:4100`, when the profile is built, then it is refused.
- Given the instructions folder `/halonic/temp/../work`, when the profile is built, then it is refused.
