# services.team-run-control

- Status: active
- Since: unreleased
- Source: Runs app build plan (HAL-18624); PR 3 plan approved by the maintainer on HAL-18699; design HAL-18594 revision 3, section 2 (Stop and Run again); task HAL-18695

Studio's services shall offer the engine's `TeamRunControl` through one service key, and shall say each outcome in the design's words, never the source's: a refused Stop as "Couldn't stop the run. It may have ended already."; a refused Run again as "Couldn't start the run: " followed by the Studio's own reason for the port's code; and, in place of **Run again**, "ACME-7 is done, so there's nothing to run again." for a closed task and "ACME-7 is with Bo now." for a task with another agent, or "ACME-7 is with someone else now." when no name is given. A Stop or Run again that went through, a run without a task and a check that couldn't be made shall add no line.

## Examples

- Given a Stop refused for any reason,
  when its words are read,
  then they are "Couldn't stop the run. It may have ended already.".
- Given a Run again refused because the team's server isn't answering,
  when its words are read,
  then they are "Couldn't start the run: the team's server isn't answering.".
- Given a check that isn't offered because ACME-7 is with Bo,
  when its notice is read,
  then it is "ACME-7 is with Bo now.".
