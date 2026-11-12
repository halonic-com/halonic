# Decision: the srt patch finds the egress check's loopback port outside the proxy range

- Approval: HAL-7431. Liam approves this note in review of this PR.
- Kind: internal

## What changes

- The sandbox-runtime 0.0.81 patch also changes `verifyWindowsWfpEgress`. It keeps each
  loopback listener that lands in the proxy port range open until a port outside the range
  comes, with one attempt more than the range has ports, and then closes them.
- `tooling/check/patches-allowed.json`: the srt entry's `next-sha256` (approved in the pull
  request before this one) becomes its `sha256`.

## Why

srt binds `127.0.0.1:0` in every srt process and tried 5 times to get a port outside
[60080,60089], closing each listener in the range. Windows hands out ports in sequence, so a
start that lands at 60080 got 60081 to 60084 next and the session failed to open: the flaky
`srt-kept-grants.windows.test.ts` in merge-group run 43213600023. With the listeners held, no
port comes twice, so one attempt more than the range has ports always finds one. srt 0.0.82
still has the 5-attempt loop.

## Covers

- tooling/check/
