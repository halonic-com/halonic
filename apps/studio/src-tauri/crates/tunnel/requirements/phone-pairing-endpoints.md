# studio.src-tauri.crates.tunnel.phone-pairing-endpoints

- Status: draft
- Since: unreleased
- Source: HAL-15157 (D6); `PairingQrPayload.endpoints` in `@halonicjs/ports` (1 to 3 endpoints, the one to try first first); ADR "Pairing and the end-to-end session", pairing rules

When a pairing names more than one endpoint for the computer, the phone shall try them in order and move on to the next only when a connection doesn't open, before it has sent anything, so a try at another endpoint never costs the code a wrong try. Once a connection has opened, the pairing shall stay on it and end with it. The phone shall keep the endpoint the pairing ran on, written as a URL that reads back to the same endpoint. When no endpoint opens, it shall say why the last one didn't.

## Examples

- Given a QR code whose first endpoint is a Wi-Fi address the phone can't reach and whose second is the computer's Tailscale name,
  when the phone pairs,
  then it pairs through the second and keeps that endpoint.
- Given a computer that takes the connection and drops it after message 2,
  when the phone pairs,
  then the pairing stops and the next endpoint is never tried.
