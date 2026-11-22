# cloudflare-durable.usage-limits

- Status: active
- Since: unreleased
- Source: HAL-16243 (split from HAL-13219); selling layer design, sections 4.4, 13.3 and 13.6

The usage account shall keep a limits document only when its amounts, member ids and period are valid and its version is higher than the one it has. Use shall count from zero only when a kept document is for a later period, never because time passed; what is still held stays held. Through one new period, the account shall still know the ids it charged in the period before: a late settle of a step charged in full then shall be corrected in that period, and a record that comes again shall not be counted again. While the account knows no limits, or the scope's status isn't active, or the actor isn't an active member of an organisation scope, it shall refuse every check and reservation. In an organisation, a reservation shall also stay within the member's share of each unit, in the same transaction as the pool's check.

Rationale: an old or replayed document must not undo a newer one; only Cloud decides when a billing period starts; a step that runs out just before a new period must not stay billed in full; a stopped customer or a removed member stops at their next step; one member must not spend the whole pool.

## Examples

- Given limits at version 2,
  when a document at version 1 or 2 arrives,
  then the account keeps version 2.
- Given a scope at its limit and a clock past the period's end,
  when a step is checked,
  then it is refused until a document for the next period arrives.
- Given a step charged in full when its reservation ran out, and then a new period,
  when the step settles late,
  then a correction is recorded for the period it was charged in, and the new period's use doesn't change.
