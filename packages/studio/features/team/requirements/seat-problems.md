# team.seat-problems

- Status: active
- Since: unreleased
- Source: HAL-17629; the board's approval of the phase 2 card (HAL-17544, 24 Nov), Choices S2 (80% and 90%) and S3 (80% is quiet); Sofia's flows on HAL-17510 (1.2); Liam's architecture note on HAL-17511 (1.4).

The Team feature shall give each seat's worst problem, worst first: full, signed out, not read (or not read for 30 minutes), reaching 90% of its week within an hour, at 90% of its week, then at 80% of its week. It shall mark only the 80% problem as quiet, and give no problem for a seat under 80% that was read in the last 30 minutes and whose forecast doesn't reach 90% within an hour.

## Examples

- Given a seat at 80% of its week, read just now,
  when its problems are worked out,
  then it has an 80% problem, marked quiet.
- Given a seat at 90% of its week,
  when its problems are worked out,
  then it has a 90% problem, not quiet.
- Given a seat at 84% of its week whose forecast reaches 90% in 40 minutes,
  when its problems are worked out,
  then it has a "reaches 90% within an hour" problem.
- Given a seat at 20% of its week last read 30 minutes ago,
  when its problems are worked out,
  then it has a "not read" problem.
