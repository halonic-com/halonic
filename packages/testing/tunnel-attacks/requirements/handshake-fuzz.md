# tunnel-attacks.handshake-fuzz

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, the B7 row (HAL-12232); task HAL-12242; ADR "Pairing and the end-to-end session"

When a seeded run of hostile handshakes reaches the host's pairing through a tunnel, each sending pairing message 1, pairing message 3 after a good message 1, or a paired phone's reconnect message 1 truncated, with a bit flipped, too long or too short, sometimes followed by a copy or random bytes, the host shall answer each with handshake frames only and close it, open no session, show no check code and pair no phone, ask its sessions nothing, and afterwards still pair a good phone and welcome the paired one. The run shall be the same for the same seed, fit a time budget that stops it early on a slow runner, and name its seed when it fails.

## Examples

- Given a seed (a fixed one in CI, `HALONIC_FUZZ_SEED` to try another), `HALONIC_FUZZ_HANDSHAKES` runs and a budget of `HALONIC_FUZZ_BUDGET_MS`,
  when each run breaks a handshake message and sends it through the tunnel,
  then the host sends only `pair2`, `resume2`, `handshake-failed` or `pair-refused` frames and closes, and no check code shows.
- Given the run is over,
  when a phone pairs with a new code and the phone paired before reconnects,
  then the new phone is paired and the old one is welcomed, and the store holds no other phone.
