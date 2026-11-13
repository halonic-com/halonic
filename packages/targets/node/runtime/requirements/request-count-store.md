# node-runtime.request-count-store

- Status: active
- Since: 0.1.0
- Source: HAL-7197; build plan on HAL-195 (PR 8)

The package shall ship `CoordinationRequestCountStore`, a `RequestCountStore` that counts each UTC day as one counter of a `Coordination`, and `openDiskRequestCountStore`, which backs it with the Node coordination adapter over a folder on disk. It shall count a request only while the day's count is below the limit, and shall keep the count over a restart. It shall pass the contract suite `requestCountStoreContract` (requirement `contracts.request-count-store`) with `durable: true`.

Rationale: a `serve` host that restarts must not give a client a fresh daily allowance; the Cloudflare target runs the same suite against its own store.

## Examples

- Given a limit of 1 and one request counted today, when the server restarts, then the next request today is refused.
- Given 20 parallel requests with a limit of 5, then exactly 5 are allowed.
