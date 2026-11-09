# studio.src-tauri.crates.secrets.secret-commands

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-229 (interface agreed with Priya), HAL-1508

When the page calls `secret_get`, `secret_set` or `secret_delete`, the shell shall check the name, and for `secret_set` the value (not empty, at most 16 KiB, and no longer than the backend's store holds: 1,280 bytes in the Windows Credential Manager), before the backend runs, and shall return the value or nothing for `secret_get`, replace any stored value for `secret_set`, and succeed for `secret_delete` even when nothing is stored. If a call fails, then the shell shall return one of the kinds `invalid_name`, `invalid_value`, `unavailable`, `denied`, `unreadable` or `backend`, with a message that never contains the value. Every backend shall pass the same contract check.

## Examples

- Given a stored value,
  when `secret_set` stores another under the same name,
  then `secret_get` returns the new one.
- Given a value of exactly 16 KiB,
  when it is stored and read,
  then it comes back whole; one byte more is `invalid_value`.
- Given the Windows Credential Manager, which holds 1,280 bytes,
  when `secret_set` stores 1,281 bytes,
  then the result is `invalid_value` and nothing is written.
- Given a name that holds nothing,
  when `secret_delete` runs,
  then it succeeds.
