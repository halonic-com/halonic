# paperclip.seats-cap-advice

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, section 4.4), part of the `seats` plugin (HAL-16008)

When the `seats.plan` job runs and the pool's P90 run-out time comes before the next big refill (the first weekly reset in the next 7 days that gives back at least the settings' points, or two weeks out when there is none), the seats forecast shall propose cap cuts: one run at a time, to the agent cut least so far and the one with the most demand now among equals, until the pool's P90 run-out is no earlier than that refill or no cut is left. It shall never propose a cut that costs the agent no runs, or that takes its cap below the settings' lowest cap. The advice shall carry the refill's time, the run-out without and with the cuts, the cut per agent, and whether the cuts are enough. The advice is a proposal only; caps are the board's decision.

## Examples

- Given a made-up seat whose weekly points last until its big refill at P90,
  when `seats.plan` runs,
  then there is no cap advice.
- Given two capped agents with more work than their caps and a pool that runs out before the refill,
  when one cut each makes the pool last,
  then the advice cuts each by one, and when one cut is enough, it cuts the agent with the most demand.
- Given an agent with no cap, or a lowest cap the agents are already at,
  when the pool runs out before the refill,
  then the advice proposes no cut and says the cuts are not enough.

## Limits

- Demand now ranks the agents by tokens, not points, so an agent on a cheaper model can rank above one that costs the pool more.
- A cut is scaled from today's running and queued runs (see `paperclip.seats-scenarios`), so it can look bigger than it is once the queue drains.
