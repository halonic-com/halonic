# runs.spend-tile

- Status: active
- Since: 0.1.0
- Source: HAL-8552, HAL-8553 (spec of the tile on Home); board decision of 13 Nov (HAL-8416); month rule of `app.month-spend`

The Runs feature shall add Home's Spend section, after Recent runs and before Cards, with one tile, "Estimated spend per month", that shows the last six calendar months (UTC), oldest first, of what the runs cost: the sum of each run's `cost` in the month it started, by the rule the monthly budget stops on. The big number shall be this month's spend as an amount in the money rule ("€120.40"; under €0.005 it reads "under €0.01", with no bar drawn for it, never "€0.00"). When the workspace sets `budget.monthly`, the tile shall draw it as a dashed line labelled "Budget", draw any month above it in amber, and say under the number "This month, estimated, within the *amount* budget" or, over it, "This month, estimated, over the *amount* budget" in the amber text colour; without one it shall draw no line and no amber and say only "This month, estimated". When no run cost anything in the six months, the tile shall stay and say "No spend yet. When a run costs something, you'll see it here by month." The tile shall not be a link or a focus stop. On a desktop it shall fill the left of two columns, on a phone one column. Before the first list loads the section shall show one skeleton card, and when that load fails the section's error "Couldn't load spend" with Try again.

## Examples

- Given a run that cost €120.40 this month and a monthly budget of 100,
  when Home shows Spend,
  then the number reads "€120.40", the line under it "This month, estimated, over the €100.00 budget" in amber, and a dashed line reads "Budget".
- Given runs in June and July but none since, and no monthly budget,
  when Home shows Spend in November,
  then June and July have bars, August to November are zero bars and the line under the number reads "This month, estimated".
- Given a run that cost €0.004 this month,
  when Home shows Spend,
  then the number reads "under €0.01" and no bar is drawn for it.
- Given no run that cost anything,
  when Home shows Spend,
  then the tile says "No spend yet. When a run costs something, you'll see it here by month." with no bars and no line, even with a monthly budget.
- Given a run that started at 23:59 UTC on 30 June,
  when Home shows Spend,
  then its cost is in June.
