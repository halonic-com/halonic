# paperclip.seats-usage-tool

- Status: active
- Since: unreleased
- Source: HAL-16008; the read-only `seat_usage()` tool in the Board Checker addendum on HAL-15997 (section 3, plan change 6), callers the Seat Supervisor and Chief only (HAL-16192)

When an agent calls `seat_usage`, the `seats` plugin shall answer only an agent the board lists in the plugin's settings (nobody until the board fills the list in), and shall give each seat's label, role and reset group, how its newest read went, its newest stored windows with their age and its alerts, from the stored readings and `seats.read`'s memory only, never reading a seat itself and never giving a folder, an account, a connection id or program output.

## Examples

- Given the plugin as installed,
  when any agent calls `seat_usage`,
  then it gets an error and no readings.
- Given an agent the board listed and a seat whose newest read was rate-limited after a good one,
  when the agent calls `seat_usage`,
  then it gets `rate-limited` with the good reading's windows and how many minutes old they are.
- Given a seat with no stored reading,
  when a listed agent calls `seat_usage`,
  then the seat shows `no-reading` and no windows.
- Given seats whose settings hold a folder, an account and a connection id,
  when a listed agent calls `seat_usage`,
  then none of them is in the answer, and no seat is read.
