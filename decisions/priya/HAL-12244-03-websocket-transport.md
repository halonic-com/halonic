# Decision: the phone's WebSocket client is tokio-tungstenite, over our own TLS

- Approval: Paperclip task HAL-12354, where Liam approved the dependency for D1 (HAL-12244), and HAL-12431, where he accepted the six extra RustCrypto crates (option A); Julian reviews this PR as the security reviewer
- Kind: internal

The phone's Rust transport needs a WebSocket client, and nothing in the shell had one.
`tokio-tungstenite` does only the upgrade and the frames, pinned to `=0.30.0` with no default
features, no TLS feature and not `connect`. The TLS is ours: `tokio-rustls` over the caller's
rustls config, which the shell builds with the platform verifier it already ships, so the app has
one TLS stack and one root store. The upgrade runs over that stream with
`client_async_with_config`, with `max_message_size` and `max_frame_size` set to one session frame
(65,536 bytes) instead of the 64 MiB and 16 MiB defaults; a test shows a larger frame closes the
connection. Only binary frames are read: a text frame closes it too. Only `halonic-tunnel` uses
the crate, and no command hands a raw socket to the page (board decision 4d).

Writing our own client was the other choice: about 300 lines of frame parsing we would own and
audit, for no gain.

**One condition wasn't met as written, and Liam accepted it on HAL-12431:** the lockfile
adds more than the four expected crates. `tungstenite` 0.30 hashes the upgrade key with `sha1`
0.11, so `sha1` 0.11 joins `sha1` 0.10, with its newer RustCrypto base (`digest` 0.11,
`block-buffer` 0.12, `crypto-common` 0.2, `hybrid-array` 0.4, `const-oid` 0.10). `utf-8` is no
longer used. The one older release that stays on `sha1` 0.10, 0.29, brings `rand` 0.9 instead, a
third `rand` major, which the approval rules out. So 0.30 is the smaller cost. It adds no second
`rand`, `http` or `thiserror` major.

## Covers

- apps/studio/src-tauri/crates/tunnel/Cargo.toml
