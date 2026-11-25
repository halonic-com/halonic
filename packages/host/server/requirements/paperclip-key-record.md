# server.paperclip-key-record

- Status: active
- Since: unreleased
- Source: review notes on #6195 by Liam and Julian, HAL-18827. Refines the record of `server.paperclip-key-password`.

When a poll of a sign-in stores a key, the server shall record, as the device that changed it, the session that asked `sign-in/start` for that sign-in (its device ID, or `browser` for a password session), not the session that polled; when the server no longer knows who started it, the session that polled. The server shall record one `connected` per sign-in, however often it is polled after it connected, so repeated polls cannot push older records out of the newest 20.

When writing that record fails after the key was stored or removed, the server shall still answer what the sign-in or Disconnect did, with 200, and shall log the failure with only the route and the error's name.

Rationale: the record exists to show which device changed the board key; the device that typed the password is the one to name, and a record that a poll loop can flood, or a failed record that reports a stored key as a failure, would mislead the owner.

## Examples

- Given a sign-in started by device A, when device B polls it and it connects, then the record names device A.
- Given a connected sign-in, when it is polled 25 times, then the record holds one `connected` for it.
- Given a store that fails to write the record, when a poll stores the key, then the poll answers 200 `connected` and the error log gets "Paperclip key record failed at sign-in/poll: TypeError".
