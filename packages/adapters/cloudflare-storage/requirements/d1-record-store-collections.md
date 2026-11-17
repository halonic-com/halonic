# cloudflare-storage.d1-record-store-collections

- Status: active
- Since: unreleased
- Source: HAL-9486; the export of a deployment's data (HAL-197 Cloud part 9)

The D1 record store's `collections` shall name every collection that has at least one change, once each and in byte order, so an export can find what a deployment holds.

## Examples

- Given changes appended to `leads` (twice) and to `agent`,
  when `collections` is called,
  then it answers `agent` and `leads`, once each, in that order.
- Given a store with no changes,
  when `collections` is called,
  then it answers an empty list.
