# Decision: the seats placement rules follow the Seat Supervisor's live rules

- Approval: /HAL/issues/HAL-16021 (the board's rules from the Supervisor's SUPERVISOR.md, 25 Nov, passed on by Liam)
- Kind: internal
- Task: HAL-16008

## What changes

`paperclip.seats-placement-rules` now matches the rules the Seat Supervisor runs today:
- Everyone moves off at 95% of the 5-hour window, or when it would get there before the next check.
- "Projected above 90%" looks to the window's reset, not 60 minutes ahead.
- A seat at 75% of its week with the weekly reset more than 24 hours away is a reserve: agents move off it, and it takes agents only when no other seat fits. The 88% weekly rule is checked first.
- A target needs its 5-hour window below 50% and its week below 75% (85% when its weekly reset is within 24 hours). The emptiest 5-hour window comes first, with ties going to the soonest weekly reset.
- At most 3 agents per seat by default.

## Why

The first rules came from the forecast plan's short summary. The board posted the Supervisor's full rules on HAL-16021, and `seats.check` should propose what the Supervisor would do.

## What doesn't change

The rules only propose moves; nothing moves anyone. The paid-API seat still takes no one, unreadable seats are still left alone, and the reset advice is unchanged. All thresholds are still settings.

## Tests

No test was weakened. The paid-API test uses 85% instead of 95%, so it still checks a full session rather than the new hard stop. The proposal text test now expects the default limit of 3. New tests cover the hard stop, the 88% rule firing before the reserve rule, reserves, target limits, the target order and the limit of 3.

## Covers

- paperclip.seats-placement-rules
- tooling/paperclip/src/seats/placement-rules.test.ts
- tooling/paperclip/src/seats/proposal-text.test.ts
