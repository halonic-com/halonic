# cloudflare-durable.usage-summary

- Status: active
- Since: unreleased
- Source: HAL-14151 (selling layer S2-25, the account menu); flows B7 and screen map 3.1 and 4.1 (HAL-12484, HAL-12684); the plan on HAL-14151 as approved; the plan's shape from HAL-18243; each unit's percent from HAL-19056 (flow C3, the 80% banner)

The usage account shall keep a limits document's plan, whose `name` is the plan's name, only when that name is 1 to 200 characters, not only blanks, with no control or format characters, and refuse a document with any other name; a document may carry no plan.

The usage object shall answer a summary of its scope for the account menu: the kept plan's name, the share of the cost limit the scope spent this period as a whole percent rounded down and at most 100, and when the kept period ends. Only what was charged counts, not what running steps still hold. With no cost limit the percent shall be `null`; with a cost limit of 0 it shall be 100; with no plan the name shall be `null`. The summary shall also give, for each unit that has a limit, the share of that limit the scope spent this period, counted the same way (rounded down, at most 100, and 100 for a limit of 0), in the order the account lists its units. While the object knows no limits, or only limits whose period has ended, all three shall be `null` and there shall be no unit, as a step counts such limits as none. A summary shall change nothing: it notes no scope, pulls nothing from Cloud and takes no rate slot.

Rationale: the account menu shows "62% of this month's usage", and the app warns from 80% of any unit's limit, from the customer's own usage object, which knows the use before Cloud does; opening a menu must not start an empty object, ask Cloud or use up the customer's calls.

## Examples

- Given a plan "Starter" with a cost limit of 1,000 and 625 charged this period,
  when the summary is read,
  then it is "Starter", 62 and the period's end.
- Given 1,200 charged of a limit of 1,000,
  then the percent is 100.
- Given 300 held by a running step and nothing charged,
  then the percent is 0.
- Given limits with only a runs limit,
  then the percent is `null`.
- Given a harness time limit of 1,000 ms and 829 ms charged,
  then the summary's units include harness time at 82.
- Given an object that was never given limits,
  then the summary is all `null`, and the object still notes no scope.
- Given 1,000 charged of a limit of 1,000 and a clock past the period's end, before Cloud sends the next period,
  then the summary is all `null`, not 100% of the old period.
- Given a document whose plan's name is blank, over 200 characters or has a control character,
  then the account refuses it.
