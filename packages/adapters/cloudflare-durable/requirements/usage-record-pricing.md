# cloudflare-durable.usage-record-pricing

- Status: active
- Since: unreleased
- Source: HAL-18362 (slice of HAL-14174); selling layer design, sections 2 and 6

A model call's usage record shall name the model that answered, as `<provider>/<model>`, and a step's record shall carry its reservation's maximum per unit, defaults included, whether the step settled or ran out. A model that isn't a machine id with one `/` shall be left out rather than refused, so the call is still charged. A run's end and a correction carry neither.

Rationale: Cloud prices each model call from its own price table and charges a step at most what it held back, rather than trusting the `cost` a deployment reports; it can only do that if the record says which model answered and what the step reserved. Leaving out a model Cloud couldn't read keeps the use counted, and Cloud holds such a call unpriced instead of pricing it at zero.

## Examples

- Given a step that reserved a cost of 300 and settled,
  when its record goes to the outbox,
  then it carries a reserved maximum of 300 for cost.
- Given a model call recorded with the model `acme-ai/acme-1`,
  when its record goes to the outbox,
  then it names that model.
- Given a model call recorded with free text as its model,
  when it is charged,
  then its record names no model and the text is nowhere in storage.
