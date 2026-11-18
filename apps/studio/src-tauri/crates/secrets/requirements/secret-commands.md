# studio.src-tauri.crates.secrets.secret-commands

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-229 (interface agreed with Priya), HAL-1508, HAL-11253

When the page calls `secret_get`, `secret_has`, `secret_set` or `secret_delete`, the shell shall check the name, and for `secret_set` the value (not empty, at most 16 KiB, and no longer than the backend's store holds: 1,280 bytes in the Windows Credential Manager), before the backend runs, shall refuse a name that belongs to Halonic (`token-key`, `serve-password`, or any name that starts with `halonic_token_`, in canonical form) with `reserved_name` before the backend runs, and shall return the value or nothing for `secret_get`, return only yes or no for `secret_has` (the value never reaches the page), replace any stored value for `secret_set`, and succeed for `secret_delete` even when nothing is stored. If a call fails, then the shell shall return one of the kinds `invalid_name`, `reserved_name`, `invalid_value`, `unavailable`, `denied`, `unreadable` or `backend`, with a message that never contains the value. The shell shall record a failed call in its log by the command, the kind and that message, never the value. Every backend shall pass the same contract check.

## Examples

- Given a stored value,
  when the page calls `secret_has` with its name,
  then the answer is `true` and holds no value; for a name that holds nothing it is `false`.

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
- Given a stored token under `halonic_token_google_refresh_acme`, and stored `token_key` and `serve_password`,
  when the page calls `secret_get`, `secret_has`, `secret_set` or `secret_delete` with `Halonic-Token-Google-Refresh-Acme`, `token-key` or `serve-password`,
  then each call is refused with `reserved_name` and the stored values are unchanged.
- Given the name `my-serve-password` or `token-key-2`,
  when the page stores and reads it,
  then the commands accept it as any other secret.
