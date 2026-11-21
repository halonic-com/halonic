# Attack cases for the remote path, and where each is tested

This is a map, not a requirement: it says which attack on the remote path (a phone, through a tunnel, to the
desktop host's remote gateway) is tested where, so the list can be traced to code. Cases A1 to A9 are phase A's:
they run in `pnpm test` of `testing/tunnel-attacks` (and so in CI) against the real gateway listener, reached
through a forwarder that stands where a tunnel stands, with the fake `TunnelProvider` of `testing/contracts`
telling the tunnel's name. Cases B1 to B12 need the pairing and the end-to-end session of phase B. Those that are
tests run against the host's own pairing desk, phone store and Pair a phone dialog (`openHostRig`); a case still
marked TODO isn't a test yet, because this repo's test run refuses a pending test, and the pull request that
writes it changes its row.

An open gap is not a test: this repo's guard counts a test that is expected to fail as a skip, and a skip needs
a signed decision note. So a gap is written in the Open column and kept with the attack-test task (HAL-5687)
until it is fixed; the fix adds the test.

| Case | What it tries | Tested in | Open |
| --- | --- | --- | --- |
| A1 | connecting to the gateway or the bridge on this computer's other addresses, or on `::1` | `src/direct-hit.test.ts` |  |
| A2 | a tunnel pointed at the bridge's port, at `0.0.0.0`, at a LAN address or with more than the gateway | `src/direct-hit.test.ts` |  |
| A3 | asking the gateway, through the tunnel, for the bridge, the model gateway, MCP or secrets | `src/direct-hit.test.ts` |  |
| A4 | DNS rebinding and a `Host` the attacker chooses (also user information, dots, ports, forwarded names, absolute targets) | `src/host-and-origin.test.ts` |  |
| A5 | a web page's request: any `Origin`, and a CORS preflight | `src/host-and-origin.test.ts` |  |
| A6 | oversize: a declared length over one Noise message (65,536 bytes) or absurd, a message in fragments, endless fragments | `src/frame-attacks.test.ts` |  |
| A7 | frames that break the format; malformed, nested, duplicated or oddly encoded messages; a message before or after hello | `src/frame-attacks.test.ts` |  |
| A8 | floods and slots: too many connections, 2,000 frames at once, a phone that never says hello | `src/frame-attacks.test.ts` |  |
| A9 | asking for a shell, a file, a secret or a setting; extra fields (`risk`); odd ids; a prompt that is a command; a risky approval | `src/protocol-escape.test.ts` |  |
| A10 | a first fuzz pass: the parser against a second reading of the protocol, and hostile connections | `src/fuzz.test.ts` |  |
| A11 | the pairing code and the check code on the wire, in `pair-refused`, in the host's log or in the mDNS records; handshake messages over their limit, and a session message of 65,519 bytes and one byte over | `src/handshake-attacks.test.ts` |  |
| A12 | a seeded fuzz of handshake messages 1 to 3: truncated, a bit flipped, too long or short, extra frames | `src/handshake-fuzz.test.ts` |  |
| B1 | a client that never paired opens a session | `src/session-attacks.test.ts` (reconnect), `src/pairing-attacks.test.ts` (pairing) |  |
| B2 | a QR code used twice | `src/pairing-attacks.test.ts` (also a code used while its first phone waits for Allow) |  |
| B3 | a QR code after it expired | `src/pairing-attacks.test.ts` |  |
| B4 | a QR code made for another host, or a pairing token guessed or edited | `src/pairing-attacks.test.ts` (a guessed or edited code is a wrong try; a QR code for another host is the phone's check of message 3, D1's) |  |
| B5 | many pairing attempts in a row | `src/pairing-attacks.test.ts` (5 wrong tries a code, 10 failed tries a minute) |  |
| B6 | a revoked device, also on a connection already open | `src/paired-phone-attacks.test.ts` (also between message 2 and the first message) |  |
| B7 | a stolen session: a copied key or ticket used from another client | TODO, phase B |  |
| B8 | a replayed message or handshake, a reordered frame | `src/session-attacks.test.ts` (reconnect; pairing with B7) |  |
| B9 | a client before the handshake holds the slots paired phones need (idle connections hold a slot until a timeout; behind a tunnel every client comes from loopback, so the gateway can't tell them apart by address) | TODO, phase B |  |
| B10 | a man in the middle reads or changes a session | TODO, phase B |  |
| B11 | a downgrade to no end-to-end encryption | `src/session-attacks.test.ts`, `src/frame-attacks.test.ts`, `src/handshake-attacks.test.ts` (a v1 message in the clear, a skipped handshake, a pattern swap) |  |
| B12 | a changed host key is accepted without the person deciding | `src/session-attacks.test.ts`, `src/paired-phone-attacks.test.ts` (the host's side; the phone's is D1's) |  |

## Running a longer fuzz pass

The fuzz tests use a fixed seed in CI. To try another, or a longer run, set the seed and the sizes; a failing
run names its seed:

The handshake fuzz takes the same seed, `HALONIC_FUZZ_HANDSHAKES` runs (200 in CI) and a time budget,
`HALONIC_FUZZ_BUDGET_MS` (15 seconds), after which a slow runner stops early.

```sh
HALONIC_FUZZ_SEED=42 HALONIC_FUZZ_RUNS=100000 HALONIC_FUZZ_CONNECTIONS=500 \
  pnpm exec turbo run test --filter=@halonicjs/testing-tunnel-attacks -- --maxWorkers=2
```
