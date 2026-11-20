# Decision: the remote gateway listens inside the end-to-end session only

- Approval: Paperclip task HAL-12238 (tunnel B3), from the phase B build plan on HAL-12232 (decisions 1–4, 8 and 9) and the ADR "Pairing and the end-to-end session"; Julian and Liam review this note
- Kind: internal

The remote gateway's listener now gives every binary frame to `SecureSession`, the host's end of the end-to-end session, and runs the gateway protocol only inside it. That changes what two active requirements say about the wire, and nothing about what the gateway lets a phone do:

- **`remote-gateway.listener`.** A text frame no longer reaches the protocol: it closes the connection, with nothing sent. The size limit is one kind byte and one Noise message (65,536 bytes) instead of 64 KiB, and a larger frame closes the connection without a cleartext `too-large`, because there is no cleartext answer left to send (ADR: no cleartext path for any gateway message). The hello time now runs from when the session opens, and the new handshake time (10 seconds) drops a connection that never finishes its handshake, so a pairing that waits up to 2 minutes for Allow isn't dropped for not saying hello.
- **`tunnel-attacks.frame-attacks`.** The same attacks run, now as a paired phone inside its session, the strongest place an attacker can stand. An oversize frame and a protocol message in the clear are expected to close the connection with nothing sent, instead of a cleartext `too-large` or `malformed`; a malformed message inside the session still gets `malformed`, inside it. A new case drops a client that never finishes the end-to-end handshake.

No test is removed and no limit is loosened: each changed example is stricter (nothing at all is sent in the clear), and the attack suite gains `tunnel-attacks.session-attacks` for cases B1, B8, B11 and B12. The gateway stays off in every launch until B8 (plan decision 19).

## Covers

- remote-gateway.listener
- tunnel-attacks.frame-attacks
