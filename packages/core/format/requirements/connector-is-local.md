# format.connector-is-local

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `connectorIsLocal` in `packages/core/schema/src/index.ts`

The format shall count a connector as local when its `local` key says so; without one, when its transport is `stdio`, or `http` with a host of `localhost`, a `*.localhost` name, `::1` or a `127.*` address. A Google connector is never local without `local: true`. Because the core has no `URL` class, the host is read by hand: after user info, without port or brackets, lowercased.

## Examples

- Given `http://127.0.0.1:8080`, when it is checked, then it is local.
- Given `http://localhost@evil.example.com/`, when it is checked, then it is not local: `localhost` is user info there.
- Given `https://tracker.example.com` with `local: true`, when it is checked, then it is local.
