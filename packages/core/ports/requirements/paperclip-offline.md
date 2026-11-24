# ports.paperclip-offline

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan (offline decision), approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-paperclip-connection.md`. Draft until track A's cache lands; it then moves to the package that holds the code and becomes active.

While Paperclip can't be reached, Studio shall show the cached items with a banner "Offline, as of" and the time of the last live read, shall turn the answer buttons off, and shall keep a typed message as a draft; it shall never queue an answer or a message to send later. The cache shall live in the app data folder, outside every workspace, keyed by server address and company.

## Examples

- Given cards last read at 14:02 and a server that stops answering,
  when the Inbox is opened,
  then it shows the cards with "Offline, as of 14:02" and the answer buttons are off.
- Given an offline connection and a typed message,
  when the line comes back,
  then the message is still a draft and was not sent.
- Given a workspace in git,
  when Studio caches a connection's items,
  then no file inside the workspace changes.
