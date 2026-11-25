# server.request-count-store

- Status: active
- Since: unreleased
- Source: HAL-7197; build plan on HAL-195 (PR 4)

Where a store implements the `RequestCountStore` port, it shall count one request for a UTC day unless the limit was already reached for that day, and shall answer whether it was allowed and the count after the call. The count shall never go above the limit, even for parallel calls. A new day shall start from zero. Where a call names a scope, the store shall keep that scope's count apart from the total and from every other scope's, by the same rules (HAL-18039). A store that is durable shall keep the count over a restart. The package shall ship `MemoryRequestCountStore`, which is not durable and drops every scope's count when a new day starts, and `CoordinationRequestCountStore`, which counts in a `Coordination`: the total as one counter per day, and each scope as one value it overwrites when a new day starts, so the store grows with the number of scopes, not with scopes times days. The contract suite `requestCountStoreContract` (requirement `contracts.request-count-store`) shall hold these rules, and each host target shall run it against its own store.

Rationale: the Node target keeps the count on disk and the Cloudflare target in a durable store; one suite makes them agree with the handler's tests. Both build on `CoordinationRequestCountStore`, so the scope counting is written once. A `Coordination` counter can't be reset, so a scope's count is a compare-and-set value instead.

## Examples

- Given a limit of 2, when three calls are made for one day, then the third is refused and the count stays 2.
- Given 20 parallel calls with a limit of 5, then exactly 5 are allowed.
- Given a durable store whose host restarts, then a day's count survives.
- Given a total at its limit, when a request names a scope, then that scope's count still starts at 1.
