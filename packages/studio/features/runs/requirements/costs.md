# runs.costs

- Status: active
- Since: unreleased
- Source: HAL-18624 (Runs app build), design revision 3 on HAL-18594 (Runs: flows, Costs), approved by the board on 25 Nov 14:48 UTC; plan conditions from the maintainer on HAL-18629

The Runs app's Costs view shall total the runs that started **Today**, in the last **7 days** or in the last **30 days**, each counted from local midnight in the user's time zone on the first day and including today, per workspace or team and then per workflow or agent. A run shall count in the day it started, even when it ended after midnight. Amounts shall be added as whole minor units of their currency, never as floats, and amounts in different currencies shall never be added together: each total keeps one sum per currency. A run that reports tokens instead of money (an agent on a subscription) shall add to the tokens total and to no money total. A total that holds a run still going shall be marked as "so far". The current time and the time zone shall be inputs, never read inside the calculation.

## Examples

- Given it is 25 November 10:00 in Madrid,
  when the Costs view asks for 7 days,
  then the period starts at midnight on 19 November in Madrid.
- Given a run that started at 23:50 yesterday and ended at 00:10 today,
  when the Costs view totals Today,
  then the run isn't in it, and it is in 7 days.
- Given it is 30 March in Madrid, the day after the clocks went forward,
  when the Costs view asks for 7 days,
  then the period starts at midnight on 24 March in Madrid, which is 23:00 UTC on 23 March, while midnight on 30 March is 22:00 UTC.
- Given runs of one workflow that cost €0.10 and €0.20, and one that cost $0.05,
  when the Costs view totals them,
  then the workflow shows €0.30 and $0.05 as two totals, never one sum.
- Given an agent on a subscription that used 1,200 and 800 tokens,
  when the Costs view totals it,
  then it shows 2,000 tokens and no money.
- Given a run still going in the workspace Acme Ops,
  when the Costs view totals it,
  then Acme Ops' total is marked "so far".
