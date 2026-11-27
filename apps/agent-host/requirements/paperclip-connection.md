# agent-host.paperclip-connection

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md`; Julian's security review HAL-17436 (finding 6). Was `ports.paperclip-connection` while a draft; the file's format is `workspace.paperclip-connection` (HAL-17435), and the rest moved here with the desktop engine that reads the connections (HAL-17438).

The workspace shall describe each Paperclip connection in its own file, `connections/paperclip/<name>.yaml`, holding only a label, the server's address and the company, never a key and never Paperclip's data; a workspace shall be able to hold several connections. Opening a workspace with a connection file shall make no call to Paperclip until the user chooses to connect and has seen the server's address and company. When the desktop engine lists a workspace's connections, it shall give a connection it holds no key for in that workspace the state `no-key`, and shall give `signed-out` only to one whose key Paperclip refused (HAL-19032) or whose file no longer matches the address and company its key was made for (`agent-host.paperclip-connection-file-changed`).

## Examples

- Given a workspace with `connections/paperclip/halonic.yaml` and `connections/paperclip/acme.yaml` that both have a task `HAL-10`,
  when Studio lists work,
  then it shows two items, each with its own source's label.
- Given a connection file that holds a field `key`,
  when the workspace is read,
  then the file is refused with a message that keys live in the keychain.
- Given a workspace with a connection file nobody has connected,
  when it is opened,
  then no request goes to the file's address.
- Given that workspace,
  when Studio lists its connections,
  then the connection's state is `no-key`; once Paperclip refuses a key handed over for it, it is `signed-out`.
