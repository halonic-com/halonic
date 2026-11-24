# ports.paperclip-connection

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-paperclip-connection.md`. Draft until track A (the connection file and `adapters/paperclip-client`) lands; it then moves to the package that holds the code and becomes active.

The workspace shall describe each Paperclip connection in its own file, `connections/paperclip/<name>.yaml`, holding only a label, the server's address and the company, never a key and never Paperclip's data; a workspace shall be able to hold several connections, and every Paperclip item Studio shows shall be named by its connection, its company and its Paperclip ID and shown with its connection's name.

## Examples

- Given a workspace with `connections/paperclip/halonic.yaml` and `connections/paperclip/acme.yaml` that both have a task `HAL-10`,
  when Studio lists tasks,
  then it shows two tasks, each under its own connection's name.
- Given a connection file that holds a field `key`,
  when the workspace is read,
  then the file is refused with a message that keys live in the keychain.
- Given a connected workspace,
  when its files are listed,
  then no Paperclip task, comment or card is among them.
