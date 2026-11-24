# ports.paperclip-key

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan (key decision), approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-paperclip-connection.md`; Julian's security review. Draft until track A's host side lands; it then moves to the package that holds the code and becomes active.

The connection's key shall be kept in the OS keychain, in one entry per connection, and in the agent host's memory only; the Studio page shall never receive it, and no file, log line, error or answer shall hold it. The host shall use a connection's key only for the calls of the `PaperclipSource` port and only at that connection's address, shall refuse a redirect to another host, and shall revoke the key in Paperclip and delete its keychain entry and cache when the connection is disconnected.

## Examples

- Given a connection to `https://paperclip.acme.test`,
  when Paperclip answers a call with a redirect to `https://other.test`,
  then the host doesn't follow it and the call fails without sending the key there.
- Given a connected Studio,
  when the page asks the host for the connection's settings,
  then the answer holds no key.
- Given a connected Studio,
  when the connection is disconnected,
  then the key is revoked in Paperclip, its keychain entry is gone and its cache is deleted.
