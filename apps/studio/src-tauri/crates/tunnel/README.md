# halonic-tunnel

The phone's end of the end-to-end session with the computer's remote gateway (tunnel phase B, HAL-12244; ADR "Pairing and the end-to-end session"). Plain Rust with no Tauri types; the Android shell wraps it, so the page never talks to the network itself (board decision 4d on HAL-5276).

- `PairingCode`, `check_code` and `pair_commit`: the Noise psk from the 12-character code, the 6-character check code from the handshake hash, and the commitment to pairing message 3. They pass the test vectors in `packages/core/ports/src/golden/pairing-vectors.json`, which the host's codecs pass too.
- `FrameKind`, `read_frame` and `read_refusal`: the binary frames, their size limits and the two cleartext refusals, `handshake-failed` and `pair-refused`, read exactly as the host writes them and nothing else.

Still to come in this crate: the Noise handshakes with `snow` (XXpsk3 to pair, IK to reconnect), rekeying, the WebSocket transport with the shared backoff, and the phone's connection states.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, for example `pairing_codes_` for `pairing-codes`.
