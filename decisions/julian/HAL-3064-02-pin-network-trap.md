# Decision: the connector suites name the traps that keep them off the network

- Approval: the maintainer approves this change in review of HAL-3064, part 2
- Kind: internal

Both requirements grow; nothing they promised before is taken away, and no test was weakened.

- `contracts.connector-client` adds a sentence on `refuseRealConnections()` from
  `@halonicjs/testing-contracts/node`, which part 1 (#891) added: a Node binding that switches it
  on fails a case when the adapter opens a TCP connection to another machine, so `https.get` and
  vendor SDKs are caught as well as `fetch`. One example is added. #891 left the text for this
  pull request so the two wouldn't conflict with #874 on the same file.
- `contracts.connector-pin` already said lookups go only through the context's `http` and no case
  reaches a real registry. It now says how the suite holds a binding to that: the same `fetch`
  trap as `contracts.connector-client`. One example is added.

The suites only got stricter: a binding that passed before and keeps off the network still passes.

## Covers

- contracts.connector-client
- contracts.connector-pin
