# action-catalog.paperclip-connect-and-test

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (the board flagged it on HAL-10, 24 Nov 13:18 UTC); architecture note on HAL-17491, row 15 and sections 6.7 and 7.8; Liam's approval of option (A) with conditions on HAL-17545

When a request names `paperclip.connect-and-test@1`, the action-catalog package shall offer the four `sign-in` steps of Paperclip's own sign-in in order (`start`, `approve`, `keep` and `test`), with risk `admin`, no secret input and no address of its own, for a Paperclip host, a connection file's name and a mode of `connect` or `test`. The preview shall name the host and the connection, and for `test` say that the test key is revoked and removed from the keychain. The manual guide, built by the stepper's own manual guide from the same definition, shall be a numbered list that opens `https://` and the host once and points the test part to Studio's Settings › Connections › Disconnect.

## Examples

- Given the host `paperclip.acme.example`, the connection `acme` and the mode `test`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://paperclip.acme.example/` and it holds `Studio › Settings › Connections › Disconnect`.
- Given a host with a path, a port or a scheme, a connection name with a path trick, or a mode other than `connect` or `test`,
  when the parameters are parsed,
  then they are refused.
