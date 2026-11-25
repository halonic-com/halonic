# agent-host.paperclip-add-account

- Status: active
- Since: unreleased
- Source: HAL-18670 (the board's decision on HAL-18359: two Paperclip accounts on the same Paperclip); `agent-host.paperclip-sign-in`

When Studio starts a Paperclip sign-in with `newConnection`, the agent host shall sign in for a new connection even when a connection file already has that address: it shall name the connection after the address's host with the first free number (`acme-2`), ask the challenge for the company of a connection file with that address, if any, and, once the key is stored, write the new connection's file and keep the key under the new name only. The connection files that were there before, and their keys, shall stay as they were. When Studio cancels that sign-in after the key was stored, the agent host shall remove only the new connection's file. When a sign-in with `newConnection` also names a connection file, the agent host shall refuse it as `address-not-allowed` and send nothing.

## Examples

- Given `connections/paperclip/acme.yaml` at `https://paperclip.acme.test` for company `acme`,
  when Studio starts a sign-in there with `newConnection` and the board approves,
  then `connections/paperclip/acme-2.yaml` holds the address and `acme`, the key is kept as `acme-2`, and `acme.yaml` and its key are unchanged.
- Given that sign-in after the key was stored,
  when Studio cancels it because its keychain refused the key,
  then `acme-2.yaml` is gone and `acme.yaml` stays.
- Given a sign-in with `newConnection` that names the connection `acme`,
  when Studio starts it,
  then the host refuses it as `address-not-allowed` and sends nothing.
