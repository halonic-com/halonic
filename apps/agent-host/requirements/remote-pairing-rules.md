# agent-host.remote-pairing-rules

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 6 (HAL-12232); task HAL-12237; ADR "Pairing and the end-to-end session", pairing rules

The agent host shall keep its pairing rules in memory only. It shall have at most one pairing open at a time, with a new 12-symbol code that works for 5 minutes. The first pairing message 3 that decrypts with the code and matches its commitment shall use the code up, whether Allow follows or not, and every later one shall be refused as `code-used`. After that message 3 the agent host shall show the check code with the phone's name and wait 2 minutes for Allow; Don't allow, the wait running out, closing the pairing or the phone's connection closing shall end the pairing, and Allow and Don't allow shall be refused before a phone used the code. A pairing message 3 that doesn't decrypt or whose commitment doesn't match, and a pairing handshake that ends after the host's message 2 without one that does, shall each count as a wrong try. The fifth wrong try shall end the code. When the agent host has counted 10 failed tries within a minute, across every code, it shall refuse pairing message 1 as `rate-limited` until the oldest of them is a minute old. While no pairing takes a phone, it shall refuse pairing message 1 as `code-ended`, or as `code-used` while Allow is awaited. The agent host shall compare nothing derived from the code itself: the Noise handshake with the code's psk is the only check of it.

## Examples

- Given an open pairing no phone has used,
  when 5 minutes pass,
  then the pairing ends with `code-expired` and pairing message 1 is refused as `code-ended`.
- Given two handshakes on one code,
  when the first one's message 3 decrypts,
  then the second one's is refused as `code-used`.
- Given a phone that used the code,
  when 2 minutes pass without Allow,
  then the pairing ends and the phone hears `timed-out`.
- Given an open pairing,
  when four message 3s fail to decrypt,
  then they are told 4, 3, 2 and 1 tries are left, and the fifth ends the code.
- Given 10 failed tries in the last minute over two codes,
  when a third code's pairing message 1 arrives,
  then it is refused as `rate-limited`, until a minute after the first of them.
