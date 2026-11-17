# Attack cases for the remote path, and where each is tested

This is a map, not a requirement: it says which attack on the remote path (a phone, through a tunnel, to the
desktop host's remote gateway) is tested where, so the list can be traced to code. Cases A1 to A9 are phase A's:
they run in `pnpm test` of `testing/tunnel-attacks` (and so in CI) against the real gateway listener, reached
through a forwarder that stands where a tunnel stands, with the fake `TunnelProvider` of `testing/contracts`
telling the tunnel's name. Cases B1 to B12 need the pairing and the end-to-end session of phase B and are not
tests yet: this repo's test run refuses a pending test, so they are listed here, and the phase B pull request that
builds the thing a case attacks writes the test and changes its row.

An open gap is not a test: this repo's guard counts a test that is expected to fail as a skip, and a skip needs
a signed decision note. So a gap is written in the Open column and kept with the attack-test task (HAL-5687)
until it is fixed; the fix adds the test.

| Case | What it tries | Tested in | Open |
| --- | --- | --- | --- |
| A1 | connecting to the gateway or the bridge on this computer's other addresses, or on `::1` | `src/direct-hit.test.ts` |  |
| A2 | a tunnel pointed at the bridge's port, at `0.0.0.0`, at a LAN address or with more than the gateway | `src/direct-hit.test.ts` |  |
| A3 | asking the gateway, through the tunnel, for the bridge, the model gateway, MCP or secrets | `src/direct-hit.test.ts` |  |
| A4 | DNS rebinding and a `Host` the attacker chooses (also user information, dots, ports, forwarded names, absolute targets) | `src/host-and-origin.test.ts` | two `Host` lines are read as the first |
| A5 | a web page's request: any `Origin`, and a CORS preflight | `src/host-and-origin.test.ts` |  |
| A6 | oversize: a declared length over 64 KiB or absurd, a message in fragments, endless fragments | `src/frame-attacks.test.ts` |  |
| A7 | frames that break the format; malformed, nested, duplicated or oddly encoded messages; a message before or after hello | `src/frame-attacks.test.ts` | a leading byte order mark is dropped, not refused |
| A8 | floods and slots: too many connections, 2,000 frames at once, a phone that never says hello | `src/frame-attacks.test.ts` |  |
| A9 | asking for a shell, a file, a secret or a setting; extra fields (`risk`); odd ids; a prompt that is a command; a risky approval | `src/protocol-escape.test.ts` |  |
| A10 | a first fuzz pass: the parser against a second reading of the protocol, and hostile connections | `src/fuzz.test.ts` |  |
| B1 | a client that never paired opens a session | TODO, phase B |  |
| B2 | a QR code used twice | TODO, phase B |  |
| B3 | a QR code after it expired | TODO, phase B |  |
| B4 | a QR code made for another host, or a pairing token guessed or edited | TODO, phase B |  |
| B5 | many pairing attempts in a row | TODO, phase B |  |
| B6 | a revoked device, also on a connection already open | TODO, phase B |  |
| B7 | a stolen session: a copied key or ticket used from another client | TODO, phase B |  |
| B8 | a replayed message or handshake, a reordered frame | TODO, phase B |  |
| B9 | a client before the handshake holds the slots paired phones need (idle connections hold a slot until a timeout; behind a tunnel every client comes from loopback, so the gateway can't tell them apart by address) | TODO, phase B |  |
| B10 | a man in the middle reads or changes a session | TODO, phase B |  |
| B11 | a downgrade to no end-to-end encryption | TODO, phase B |  |
| B12 | a changed host key is accepted without the person deciding | TODO, phase B |  |

## Running a longer fuzz pass

The fuzz tests use a fixed seed in CI. To try another, or a longer run, set the seed and the sizes; a failing
run names its seed:

```sh
HALONIC_FUZZ_SEED=42 HALONIC_FUZZ_RUNS=100000 HALONIC_FUZZ_CONNECTIONS=500 \
  pnpm exec turbo run test --filter=@halonicjs/testing-tunnel-attacks -- --maxWorkers=2
```
