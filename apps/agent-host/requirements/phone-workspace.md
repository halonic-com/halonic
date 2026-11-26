# agent-host.phone-workspace

- Status: active
- Since: unreleased
- Source: HAL-19021 (G2c of the phase 2 plan on HAL-17503)

When the agent host offers remote and has a profile folder and at least one workspace, it shall give the remote gateway the `PhoneMessaging` view (`agent-host.gateway-phone-messaging`) of the workspace whose messaging Studio last asked for, or of the first workspace the launcher named before Studio asks for any. It shall look the workspace up again on every read, so a paired phone follows the workspace Studio has open. A phone's reads shall never change which workspace that is.

## Examples

- Given a host with workspaces `acme` and `acme-other` that Studio hasn't asked about yet,
  when a paired phone lists its sources,
  then it reads `acme`'s messaging.
- Given Studio then reads `acme-other`'s messaging,
  when the phone lists its sources again,
  then it reads `acme-other`'s.
