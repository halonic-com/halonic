# Pairing and the end-to-end session: Noise XXpsk3 to pair, IK to reconnect

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

The ADR "Only the remote gateway is reachable by a tunnel" says the gateway
protocol always runs inside Halonic's own end-to-end session, even when the
tunnel encrypts the path itself. Phase B of the tunnel plan builds that session
and the pairing that sets it up (build plan on HAL-12232, screens on HAL-12206).
The board picked the flow: scan a QR code or type a 12-character code, compare a
6-character check code on both screens, press Allow on the computer. Pairing
must never send the code as a password, a phone the computer has revoked must
learn so only from the real computer, and a changed computer key must never be
read as Removed. We looked at TLS with pinned certificates (no way to mix a
short code in, and a certificate store on every platform), a PAKE such as CPace
(no vetted library on both the host and Android today), and the Noise protocol
framework, which the approved plan names and which has vetted libraries on both
sides (`snow` in Rust).

## Decision

**Protocol version 2.** The gateway protocol becomes version 2. A connection
opens with a Noise handshake in binary WebSocket frames, then every gateway
message (`hello`, `watch`, `event`…) runs inside a Noise transport message.
There is no cleartext path for any of them, so there is no "downgrade to no
end-to-end" to attack. The only cleartext messages left are the two refusals
below, which carry no data and change nothing on the phone. As before, a new
message type is a new version, and there is no negotiation: the Noise prologue
is `halonic-gateway/2`, so a peer of another version fails the handshake.

**Pairing: `Noise_XXpsk3_25519_ChaChaPoly_SHA256`, on both routes.**

- The psk is HKDF-SHA256 of the 12-character code (its ASCII, without spaces
  or dots), with an empty salt, info `halonic pair psk v1`, 32 bytes. The code
  is mixed into the handshake and never sent.
- Message 1 (phone): `e`. Message 2 (host): `e, ee, s, es`, with the host's
  name as payload. Message 3 (phone): `s, se, psk`, with the phone's name and
  platform as payload.
- **QR route:** the QR carries the host's static key. The phone checks that the
  key from message 2 is that key (the pin) and stops if it isn't.
- **Typed route:** the phone learns the host's key from message 2 and pins it,
  but only after the check code matches and Allow is pressed.
- psk3 means both sides have committed to their static keys before the code is
  checked, and one handshake serves both routes.

**Check code.** HKDF-SHA256 of the handshake hash, empty salt, info
`halonic pair check v1`, 8 bytes. Read them as an unsigned 64-bit big-endian
integer, reduce it mod 31⁶ and write it as 6 symbols of the pairing alphabet,
most significant first, shown as `4F7 · 2KQ`. The bias from the reduction is
under 2⁻³⁴. Both screens show it; the host shows it with the phone's name and
waits for Allow.

**The alphabet** is the 31 symbols `23456789ABCDEFGHJKMNPQRSTUVWXYZ`: no 0, O,
1, I or L. A pairing code is 12 symbols (about 59 bits), shown in three groups
of four. Input is read case-insensitively; spaces, dots and dashes are dropped.

**Pairing rules (host, in memory only).**

- A code lives 5 minutes and pairs at most one phone. The first message 3 that
  decrypts with it uses it up, whether Allow follows or not. Closing the
  dialog ends it at once. Only one pairing is open at a time.
- After that message 3 the host waits 2 minutes for Allow. Don't allow, a
  timeout, or the phone leaving ends the pairing.
- A message 3 that doesn't decrypt is a wrong try. 5 wrong tries end the code.
  A host takes at most 10 failed tries a minute, across all codes; past that
  it refuses message 1 until the minute is over.
- The host compares in constant time anything derived from the code.
- Before message 3 decrypts, the host answers a refusal with a cleartext
  `pair-refused {reason, triesLeft}` and closes. It is informative only: anyone
  on the path could fake it, and all it can cause is an error screen.
- After message 3 decrypts, the host's answer is encrypted: `paired` once Allow
  is pressed, or `pair-refused` with `denied` or `timed-out`.

**Reconnect: `Noise_IK_25519_ChaChaPoly_SHA256`.** The phone encrypts message 1
to the pinned host key and sends its own static key in it. The host answers
message 2, which proves who it is. Then, in this order: if it doesn't know the
phone's key, it sends an encrypted `not-paired` and closes; if it does, the
phone sends `hello` and the host answers `welcome`. The host keeps no list of
revoked phones: an unknown key gets the same answer. A phone revoked while
connected gets `not-paired` at once, inside the session, and the host closes.

**A changed host key is not Removed.** When the host can't decrypt IK message
1 (its key changed: Halonic was reinstalled or restored), it sends a cleartext
`handshake-failed` and closes. When the phone can't decrypt message 2, it
closes. Either way the phone shows "Can't confirm your computer" and clears
nothing. A timeout, a refused connection or bytes it can't read are "Can't
reach" or "Reconnecting". Only an encrypted `not-paired`, after message 2 has
proved the host, means Removed. Anyone on the path can fake
`handshake-failed`, but it can only cause a state that deletes nothing.

**Rekeying and session length.** Each side rekeys its own sending direction:
it sends a `rekey` frame (an empty transport message) as the last one under
the old key and then calls Noise `rekey`; the other side calls `rekey` on its
receiving key when it reads that frame. A sender rekeys at least every 10,000
messages or 30 minutes, whichever comes first, and a receiver closes the
connection when a 10,001st message arrives since the last `rekey`. The host
ends a session after 24 hours; the phone then reconnects with IK.

**Sizes and time.** One gateway message is one Noise transport message, so the
largest inner message is 65,519 bytes (Noise's 65,535 less the 16-byte tag),
which replaces version 1's 64 KiB. Each binary frame is one kind byte and one
Noise message. A handshake message is at most 1,024 bytes, and a handshake
that hasn't finished within 10 seconds of the first frame is closed. The
names in the handshake payloads are at most 64 bytes of UTF-8.

**Device id.** A paired phone's id is the first 16 bytes of the SHA-256 of its
static public key, in base64url without padding (22 characters, which keeps
the gateway's id rule).

**QR payload.** `halonic-pair:` followed by base64url (no padding) of a binary
record: the version (1), the host's static key (32 bytes), the code (8 bytes,
the 12 symbols as one base-31 number), the host's name (a length byte and at
most 32 bytes of UTF-8) and up to 3 endpoints (a count, then a length byte and
the URL of each). The whole text is at most 150 bytes, so it fits a version 8
QR code at error correction level M (152 bytes in byte mode). An endpoint that
doesn't fit is left out, so the LAN endpoint goes first.

**The known limit.** With psk3, an active attacker who plays the computer can
take one message 3 and test guesses for the code offline. At about 59 bits
and a 5-minute life that isn't practical (years of GPU time for one code), and
the check code and Allow are still required. A PAKE (CPace) would close even
that; it is a later option, not phase B.

**No crypto of our own.** We write no primitives. The phone uses `snow`; the
host's Noise library is chosen in B1 against the published Noise test vectors
and an interop test against `snow`, and sits behind one adapter. Our own code
is the framing, the codecs, the rules above and the tests.

## Consequences

- `@halonicjs/ports` holds the version 2 messages, the frame kinds, the
  refusals, the limits and the times (`remote-gateway-protocol.ts`,
  `remote-gateway-session.ts`), and the codecs for the pairing code, the check
  code and the QR payload with test vectors. The phone's Rust side checks
  itself against the same vectors.
- The remote gateway adapter still speaks version 2's messages without the
  Noise layer until B3 adds it. It stays off in every launch until B8, so
  nothing reaches it meanwhile (`apps/agent-host/AGENTS.md`).
- The phase B attack suite (B7) has fixed rules to test: no message before
  the handshake, `not-paired` never before message 2, `handshake-failed` never
  read as Removed, the try limits, the sizes and the rekey limit.
- The host stores only public data about phones. Its own static key goes
  through the secrets port; the phone wraps its key with the platform key
  store (build plan decision 10).
- A PAKE later would be protocol version 3.

## Changed from an earlier decision

"Only the remote gateway is reachable by a tunnel" set version 1, with a
64 KiB limit and the end-to-end session left to phase B. Version 2 runs every
message inside that session, lowers the limit to 65,519 bytes, and adds
`paired`, `not-paired` and `pair-refused` inside it, a `rekey` frame, and
`handshake-failed` and `pair-refused` outside it. Everything else in that record stands.
