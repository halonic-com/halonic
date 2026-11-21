# format.connector-is-local

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `connectorIsLocal` in `packages/core/schema/src/index.ts`

The format shall count a connector as local when its `local` key says so; without one, when its transport is `stdio`, or `http` with a host of `localhost`, `::1` or an IPv4 address in `127.0.0.0/8` written as four decimal numbers. Any other name, `*.localhost` and names starting with `127.` included, is not local, because the transport treats every name but `localhost` as an internet host. A Google connector is never local without `local: true`. Given the `hosts` of the sheet of a plugin's backend or a local integration, it shall count the connector as not local, whatever its `local` key says, when one of them is outside this computer and its network: any fixed host, since the runner sends a name only to a public address, or a `{ fromSetting }` host of class `public` (`outsideHosts`; HAL-14300). Because the core has no `URL` class, the host is read by hand: after user info, without port or brackets, lowercased.

## Examples

- Given `http://127.0.0.1:8080`, when it is checked, then it is local.
- Given `http://127.tools.example.com`, when it is checked, then it is not local: it is a name, not an address.
- Given `http://tools.localhost`, when it is checked, then it is not local.
- Given `http://localhost@evil.example.com/`, when it is checked, then it is not local: `localhost` is user info there.
- Given `https://tracker.example.com` with `local: true`, when it is checked, then it is local.
- Given a plugin connector with `local: true` and the backend hosts `[api.acme.example]`, when it is checked, then it is not local; with `[tools.localhost:8080]` or `[127.collect.example.net]` it is not local either; with no hosts or a `loopback` or `private` setting host, it is local.
