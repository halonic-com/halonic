# server.request-count-store

- Status: active
- Since: 0.1.0
- Source: HAL-7197; build plan on HAL-195 (PR 4)

Every `RequestCountStore` shall count one request for a UTC day unless the limit was already reached for that day, and shall answer whether it was allowed and the count after the call. The count shall never go above the limit, even for parallel calls. A new day shall start from zero. A store that is durable shall keep the count over a restart. The package shall ship `MemoryRequestCountStore`, which is not durable. The contract suite `requestCountStoreContract` (requirement `contracts.request-count-store`) shall hold these rules, and each host target shall run it against its own store.

Rationale: the Node target keeps the count on disk and the Cloudflare target in a durable store; one suite makes them agree with the handler's tests.

## Examples

- Given a limit of 2, when three calls are made for one day, then the third is refused and the count stays 2.
- Given 20 parallel calls with a limit of 5, then exactly 5 are allowed.
- Given a durable store whose host restarts, then a day's count survives.
