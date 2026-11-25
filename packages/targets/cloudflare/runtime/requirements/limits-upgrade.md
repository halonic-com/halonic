# runtime.limits-upgrade

- Status: active
- Since: unreleased
- Source: HAL-14158 (selling layer S3-6); `engine.plan-stops`; `cloudflare-durable.usage-overrides`

When the usage object refuses a step at one of the pool's limits, the Worker's stop shall carry the refusal's `canUpgrade` as it is, and `false` when the refusal doesn't say. A stop at a member's share shall always say `false`.

Rationale: the app words a stop's upgrade offer from the stop alone, without asking Cloud, and must never offer an upgrade the document didn't promise.

## Examples

- Given a refusal at the cost limit with `canUpgrade` true,
  then the stop's detail has `canUpgrade: "true"`.
- Given a refusal at the cost limit that doesn't say,
  then the stop's detail has `canUpgrade: "false"`.
