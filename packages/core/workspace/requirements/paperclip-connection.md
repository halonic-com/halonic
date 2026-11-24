# workspace.paperclip-connection

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-paperclip-connection.md`; draft `ports.paperclip-connection` (HAL-17425), made active here by HAL-17435 for the connection file

When the workspace reads its Paperclip connections, it shall read each file `connections/paperclip/<name>.yaml` as one connection named by its file name, holding only a `label`, an `address` that is `https://` (or `http://` only for a server on this computer, such as `localhost` or `127.0.0.1`) and a `company`, shall refuse a file with any other field, saying for a key, token or secret that keys live in the keychain, and shall refuse a second file for the same address and company.

## Examples

- Given `connections/paperclip/halonic.yaml` with a label, `address: https://paperclip.example.com` and a company, when the workspace is read, then it lists one connection named `halonic` with that label, address and company.
- Given a connection file that holds a field `key`, when it is read, then the file is refused with a message that names `key` and says keys live in the keychain.
- Given `address: http://paperclip.example.com`, when it is read, then the file is refused with `paperclip-address`, saying to use https://.
- Given `address: http://localhost:3100`, when it is read, then the connection is accepted.
- Given `connections/paperclip/halonic.yaml` and `connections/paperclip/acme.yaml`, when the workspace is read, then it lists two connections, `acme` and `halonic`.
- Given two files with the same address and company, when the workspace is read, then the second is refused with `duplicate-paperclip-connection`, naming the first.
