# halonic-tunnel

The phone's end of the end-to-end session with the computer's remote gateway (tunnel phase B, HAL-12244; ADR "Pairing and the end-to-end session"). Plain Rust with no Tauri types; the Android shell wraps it, so the page never talks to the network itself (board decision 4d on HAL-5276).

- `PairingCode`, `check_code` and `pair_commit`: the Noise psk from the 12-character code, the 6-character check code from the handshake hash, and the commitment to pairing message 3. They pass the test vectors in `packages/core/ports/src/golden/pairing-vectors.json`, which the host's codecs pass too.
- `FrameKind`, `read_frame` and `read_refusal`: the binary frames, their size limits and the two cleartext refusals, `handshake-failed` and `pair-refused`, read exactly as the host writes them and nothing else.

- `Endpoint`: a `wss:`, `https:` or `tcp:` endpoint from a pairing, and the gateway's WebSocket URL there.
- `Transport`: the byte pipe to one gateway, the `TunnelTransport` port's rules in Rust. It reconnects with `Backoff::TUNNEL`, refuses frames while not open and never resends, and pauses and resumes. Each `Opened` event is a new connection for the session layer to handshake on, with an id that its frames and drops carry, so nothing meant for one connection reaches the next. Sends and closes have time limits (`Timeouts::TUNNEL`), so a peer that stops reading can't hold up a pause. `tokio-tungstenite` does only the upgrade and the frames, capped at one session frame. TLS comes from the `Dialer`'s rustls config, which the shell builds with the platform verifier.
- `PhoneKeys`: the phone's static X25519 key pair. The key store that wraps it (D2) is not this crate's. This crate's own copies of the private key, the pairing code and the psk are wiped from memory when they're dropped; `snow` keeps copies in its handshake state that it doesn't wipe.
- `Pairing` and `Reconnect`: the two handshakes, `Noise_XXpsk3_25519_ChaChaPoly_SHA256` and `Noise_IK_25519_ChaChaPoly_SHA256`, done by `snow`. Each takes frames in and gives frames out, so the tests run them against a fake host built on `snow`'s responder side. `SessionError` says what the phone can tell: `CantConfirm` (never Removed), `PairRefused`, or `Unreadable`.
- `Session`: one gateway message per transport message, with the `rekey` frame every 10,000 messages or 30 minutes. It fails closed: after its first error, every call gives `Ended`.

- `start_pairing` and `PairingAtCheck::wait_for_allow`: one pairing over the network. A single connection, never reconnected (the host counts a pairing dropped after its message 2 as a wrong try), runs messages 1 to 3 with a new phone key pair and stops at the check code; then it waits for the computer's encrypted answer, `paired`, `denied` or `timed-out`, for at most `ALLOW_TIMEOUT` (the host's 2 minutes and a margin). A wrong code shows only then, as the host's cleartext `pair-refused`, because the code is mixed in at message 3. `PairingProblem` says why a pairing stopped: can't reach (with the reason), the handshake's own `SessionError`, denied or timed out.
- `PhoneConnection`: a paired computer's connection, with the phone's states worked out only from what the phone can see.

`tests/gateway.rs` runs the phone against the computer's real remote gateway in Node (`@halonicjs/adapter-remote-gateway`, started by its `phone-interop-host.test-helper.ts`). It needs pnpm and the workspace's packages, so plain `cargo test` ignores it; CI's Rust job runs it. After `pnpm install` at the repository root:

```sh
cargo test -p halonic-tunnel --test gateway -- --ignored
```

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, for example `pairing_codes_` for `pairing-codes`.
