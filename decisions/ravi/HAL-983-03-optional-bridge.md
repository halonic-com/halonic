# Decision: a sandbox profile can say it has no bridge

- Approval: Liam approved the optional loopback bridge on HAL-983 (review of HAL-4280): default unchanged, no-bridge fence tests on bubblewrap, Seatbelt and Windows; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:I7vl6V1AASe7wGYs0TEVRKywymZJLGtlehlfaaRzUsvrUVbWISbAC82tLjIvrwvki0eHWobDJjemJqd8K3G1BA==
- Task: HAL-983

## What changes

`ports.sandbox-profile` gains one promise and one example: a profile whose bridge is `null`
reaches only its listed sites and no loopback address at all, and such a profile compiles.

`sandbox-srt.profile-to-srt-config` gains one example: without a bridge, the allowed domains are
exactly the allowed sites (none means no network), and a site that resolves to loopback is
refused on every port.

Every existing promise and example stays as it was, including that a profile without the field
doesn't compile and that a bridge which isn't a loopback address is rejected. No example was
removed or weakened.

## Why

The fenced runner for local integrations talks to Halonic over stdio and needs no network
(HAL-958 design). A required bridge gave it an open loopback port it never uses. The reasons and
the version bump (3 to 4) are in `docs/adr/2026-11-10-sandbox-optional-bridge.md`. This is a port
change inside the approved design, with no change for existing callers, so the note is internal.

## Covers

- ports.sandbox-profile
- sandbox-srt.profile-to-srt-config
