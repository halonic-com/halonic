# cloudflare-durable.usage-limit-events

- Status: draft
- Since: unreleased
- Source: HAL-14159; selling layer design, section 4.5

The usage account's outbox shall carry, besides usage records, a row for each stop at a limit (its code, run id, customer and time, with `phase: reserve` when a step was refused before it started), each run that starts waiting at a plan limit, each wait that fails, and each change of a customer's running count. Such a row shall hold only ids, an enum, whole numbers and times; an id, code or number that isn't one shall be refused before a row exists. Each row shall carry an id that names its customer and is the same for the same event, so a row sent twice is counted once and two customers' events never share one. A threshold row shall say when the limit it reached is the seller's override.

Rationale: Cloud shows the seller why customers stop and how many runs they hold, and bills nothing from it, so the rows must never carry a run's content; a resend after a lost reply must not count an event twice.

## Examples

- Given a stop whose input carries an extra text field,
  when its row is built,
  then that text is nowhere in the row.
- Given the same stop built twice,
  when the two rows are compared,
  then their ids are equal.
