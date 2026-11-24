# ports.paperclip-polling

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan (polling decision), approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-paperclip-connection.md`. Draft until track A's host side lands; it then moves to the package that holds the code and becomes active.

While Studio's window is in front, the host shall read each connection about every 30 seconds; while it is in the background, about every 5 minutes; and when the window comes back to the front, the host shall read at once. Timers shall go through the `Scheduler` port.

## Examples

- Given a window in front,
  when 30 seconds pass,
  then the host reads the connection once.
- Given a window in the background for 2 minutes,
  when it comes back to the front,
  then the host reads the connection at once.
