# router.run-outcome

- Status: active
- Since: unreleased
- Source: HAL-16999; Q2, Q3 and Q4 in architecture note section 10 on HAL-16984 (Liam's answers on HAL-16992), the routing stamp from HAL-16985

When the cost export reads a Paperclip run record, it shall give one `route_outcomes` cost row only for a finished run whose process started and whose server-written routing stamp names a variant and a catalog alias, priced at that alias's list price with the catalog's price version, the paid cost, and a drift flag when the reported cost is more than 10% from the list price; a run that ended because its provider was down shall keep its cost but not count as training evidence; every other run shall be skipped with its reason.

## Examples

- Given a finished run stamped `V7` on `deepseek-flash` with 1,000,000 input tokens and 100,000 output tokens, reported at $0.12 and billed per call,
  when the export reads it,
  then the row has a list cost of $0.1274, a paid cost of $0.12, the catalog's price version and no drift flag.
- Given a finished seat run stamped on `opus` that reported $0.50 while its list price is $0.40,
  when the export reads it,
  then its paid cost is 0 and the row is flagged for drift.
- Given a run that failed before its process started, with a routing stamp carried over from its wake,
  when the export reads it,
  then it is skipped as `not-started`.
- Given a finished run whose stamp has `variant: null`,
  when the export reads it,
  then it is skipped as `unrouted`.
- Given a finished run with no routing stamp,
  when the export reads it,
  then it is skipped as `unstamped`.
- Given a run that is still going,
  when the export reads it,
  then it is skipped as `unfinished`, so a later pass reads it again.
- Given a finished run stamped on an alias the catalog doesn't have,
  when the export reads it,
  then it is skipped as `unknown-alias`.
- Given a routed run that ended with `provider_down`,
  when the export reads it,
  then the row keeps its cost and is not training evidence.
