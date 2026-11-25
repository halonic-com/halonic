# cloudflare-durable.usage-summary

- Status: active
- Since: unreleased
- Source: HAL-14151 (selling layer S2-25, the account menu); flows B7 and screen map 3.1 and 4.1 (HAL-12484, HAL-12684); the plan on HAL-14151 as approved

The usage account shall keep a limits document's plan name, `planName`, only when it is 1 to 200 characters of text, and refuse a document with any other name; a document may carry none.

The usage object shall answer a summary of its scope for the account menu: the kept plan name, the share of the cost limit the scope spent this period as a whole percent rounded down and at most 100, and when the kept period ends. Only what was charged counts, not what running steps still hold. With no cost limit the percent shall be `null`; with a cost limit of 0 it shall be 100; with no plan name the name shall be `null`. While the object knows no limits, all three shall be `null`. A summary shall change nothing: it notes no scope, pulls nothing from Cloud and takes no rate slot.

Rationale: the account menu shows "62% of this month's usage" from the customer's own usage object, which knows the use before Cloud does; opening a menu must not start an empty object, ask Cloud or use up the customer's calls.

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
- Given an object that was never given limits,
  then the summary is all `null`, and the object still notes no scope.
- Given a document whose plan name is empty, or over 200 characters,
  then the account refuses it.
