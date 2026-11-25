# server.device-pairing

- Status: active
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, §2 and §6 (PR S6), with the answers of HAL-18626; Julian's security note on HAL-17513, findings S4, S5, S9 and S11; check code as in HAL-17363's phone pairing

The server's console command `halonic serve pair` shall print a one-time pairing code of 8 characters from `pairingAlphabet` (`core/ports/pairing-codes.ts`) that lasts 10 minutes. A signed-in Studio shall get such a code ("Add a device") only when the request also carries the current `serve-password`. `POST /api/pair` with `{ code, deviceName }` shall answer a random pending ID of at least 128 bits and a short check code; a wrong code shall count against `server.login-limit`, and a second request with a code that has one waiting shall be refused and shall end the first (`server.device-pairing-answers`). Allow, from the console or from a signed-in Studio with the current `serve-password`, shall show the device's name and its check code. Once allowed, polling the pending ID shall answer, once only, a device session token of at least 256 random bits; a used or guessed pending ID shall answer nothing, and a cancelled, refused or expired one only why it ended (`server.device-pairing-answers`). The server shall store only the token's SHA-256, per device, in the `Coordination` port, with the device's name, the device that allowed it, its start time and when it was last seen, compare it in constant time, and accept it only in `Authorization: Bearer` (`server.session-credential`). A device session shall end 30 days after its last use and 90 days after it started, whatever its use. `halonic serve devices` and a signed-in Studio shall list the devices; revoking one shall end only its session and shall offer to revoke the devices it allowed. A new `serve-password`, or revoking every session, shall end every device session and every pairing code and request made before it. A device name shall hold no control or format characters. A stored session record of an unknown version shall count as signed out, never as an error.

Rationale: a stolen device token can't add a device that outlives its own revoke, and no code alone signs anyone in.

## Examples

- Given a used code, or one 10 minutes old on a fake clock, when `POST /api/pair` sends it, then it is refused; the 11th wrong code in the window answers 429.
- Given a device session without the password, when it asks to Allow or to add a device, then it is refused.
- Given devices A and B, when A is revoked, then B is still signed in.
- Given a token sent as a cookie, then it is refused; given a token unused for 31 days, or 91 days old with daily use, then it is refused.
- Given a rollback to a build that doesn't know the record's version, then the device is signed out and the server keeps running.
- Given a request allowed before a new `serve-password` or a revoke of every session, when its pending ID is polled, then it gets nothing; a code made before it is refused.
- Given a device name with a bidi or zero-width character, when `POST /api/pair` sends it, then it is refused.

## Notes

- Known and accepted (Julian's security review of S6): after a rollback and a roll-forward, the older build's first write starts a fresh record, so devices paired on the newer build are lost. They fail closed: they're signed out and pair again.
