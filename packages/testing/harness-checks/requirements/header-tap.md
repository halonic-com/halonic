# harness-checks.header-tap

- Status: active
- Since: 0.1.0
- Source: HAL-4475 (C4 of the [HAL-194 build plan](/HAL/issues/HAL-194#document-build-plan); HAL-1710 check 1)

The header tap shall stand in front of the bridge on a loopback address and pass each request on to the bridge unchanged, with its method, path, headers and body, and pass the bridge's answer back unchanged, streaming included. For each request it shall keep only the method, the path without its query, whether each watched header was sent (present or absent) and the bridge's status, and never a header's value.

## Examples

- Given a request to `/v1/messages?beta=true` with a made-up `authorization` header, when it passes the tap, then the bridge gets the same header and body, and the tap keeps `POST /v1/messages`, `authorization: present` and the bridge's status.
- Given a request without `x-api-key`, when it passes the tap, then the tap keeps `x-api-key: absent`.
- Given any request, when it has passed, then no header value appears in what the tap kept.
