# tunnel-attacks.fuzz

- Status: active
- Since: unreleased
- Source: tunnel phase A4 of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5687

The gateway's message parser shall agree with a second, separately written reading of the protocol on every input of a seeded fuzz run, never throw, and accept only a message whose fields are exactly those of its type; and the gateway shall live through a seeded run of hostile connections, each sending mutated messages and random frames, without a crash, without answering a risky approval and without passing on anything but a protocol message.

## Examples

- Given a seed (a fixed one in CI, `HALONIC_FUZZ_SEED` to try another) and thousands of valid messages with fields dropped, added, retyped, stretched or filled with edge values, and of random bytes,
  when the parser reads each as a frame,
  then it never throws, and it accepts exactly what the second reading accepts, unchanged.
- Given a seeded run of connections that send mutated messages and random frames,
  when they have all ended,
  then the host still answers a good phone, and every call the source got is a prompt or the answer to a normal approval.
- Given a failing run,
  then the message names the seed, so the run can be repeated.
