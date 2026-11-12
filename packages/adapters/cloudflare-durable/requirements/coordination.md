# cloudflare-durable.coordination

- Status: active
- Since: 0.1.0
- Source: HAL-6795; build plan part 5 (HAL-197); ADR 5.2; `Coordination` port v1

The Cloudflare coordination adapter shall run every `Coordination` call as one atomic change in a single Durable Object, reading the time from the object's own clock, and shall pass the `Coordination` contract suite inside workerd, parallel attempts included. Adapters made for the same object name shall see the same leases, values, counters and windows, and adapters made for different names shall not.

## Examples

- Given two adapters made for the same object name,
  when one takes a lease,
  then the other can't take it.
- Given an adapter made for another object name,
  when it takes the same key,
  then it gets the lease.
