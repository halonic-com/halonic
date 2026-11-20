# agent-host.remote-paired-phones

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 10 and 11 (HAL-12232); task HAL-12237; ADR "Pairing and the end-to-end session", device id and reconnect; design "Tunnel phase B screens" (HAL-12206), decision 13

The agent host shall keep the phones it paired in a private file in the person's profile, with public data only: each phone's device id (the first 16 bytes of the SHA-256 of its static public key, in base64url), its public key, its name, its platform, when it was paired and when it was last seen. The agent host shall show and keep a phone's name cleaned by the rules of `ports.remote-gateway-host-name` (no control, bidi or invisible characters, at most 64 bytes of UTF-8), or "Phone" when nothing of it is left. A phone paired with a name another paired phone has shall get " (2)", " (3)" and so on; a phone paired again shall replace its old entry. If the file is damaged, then the agent host shall refuse to read it rather than take it for an empty list. A phone shall count as connected while a session with it is open, and its last seen shall be written when a session ends and every 60 seconds while one is open. Revoking a phone shall remove it and cut its open sessions at once, and Revoke all shall do so for every phone; an id that isn't paired shall change nothing. If the file can't be written on a revoke, or one of the phone's sessions can't be cut cleanly, then the phone shall still be left out for as long as the host runs, and every other session shall still be cut.

## Examples

- Given a paired "Pixel 8",
  when a second phone named "Pixel 8" is paired,
  then it is kept as "Pixel 8 (2)".
- Given a phone with an open session,
  when a minute passes,
  then its last seen is now, and when the session ends it is written again.
- Given two paired phones, each with an open session,
  when one is revoked,
  then only its session is cut and only it leaves the list.
- Given a paired phones file that isn't valid,
  when the host reads it,
  then it refuses it and says what is wrong.
- Given a phone that names itself with a right-to-left override and a line break,
  when the host shows its check code,
  then the name is shown without them.
