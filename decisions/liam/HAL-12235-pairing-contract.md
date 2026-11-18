# Decision: the gateway protocol moves to version 2, inside a Noise session

- Approval: Paperclip task HAL-12235, from the tunnel phase B build plan on HAL-12232 (decisions 1–9); Liam wrote it, Julian reviews the ADR and signs this note as the security reviewer
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:XhTjrORWe6pXb3IiEvvyeiu1kfD0vt4ohB6Ace+gkl+NWJjoVugstezHOkmUL866KGyaCYZLYyENHswevvGuDA==

Phase B adds pairing and an end-to-end session to the remote gateway. The ADR "Pairing and the
end-to-end session" (`docs/adr/2026-11-18-pairing-and-the-end-to-end-session.md`) sets the
handshakes, the frames, the pairing rules and rekeying. The gateway stays off in every launch until
B8, so nothing changes for a user yet.

- `ports.remote-gateway-protocol`: version 2. Every message runs inside the Noise session, so the
  cleartext path has no message types left and no "downgrade to no encryption" exists. The host
  gains `paired`, `pair-refused` (`denied`, `timed-out`) and `not-paired`. The size limit becomes
  65,519 bytes, one Noise transport message less its 16-byte tag, instead of 64 KiB. A binary frame
  is no longer `malformed` in itself: binary is what the session's frames are. A `hello` or a
  `welcome` must say version 2; there is still no negotiation.
- `agent-host.remote-gateway`: the `sessions` reply is bounded by the same 65,519 bytes, so the
  wording follows the new limit. The behaviour is otherwise unchanged, and the gateway still opens
  no port in a launch.
- The new requirement `ports.remote-gateway-session` holds the handshakes, the frames, the
  cleartext refusals, the pairing rules and the rekeying constants. After Julian's review it also
  holds the phone's commitment to pairing message 3, sent in message 1, so that someone who knows
  a leaked code can't search for a message 3 that makes the two check codes match. A pairing
  handshake the host answered with message 2 that doesn't end in a message 3 that decrypts and
  matches is a wrong try too, so that search can't move to the host's side either.

## Covers

- agent-host.remote-gateway
- ports.remote-gateway-protocol
