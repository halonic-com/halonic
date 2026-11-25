# Decision: the srt own-loopback canary runs only on Linux

- Approval: Liam approved the Linux-only skip on HAL-18176 ([comment](/HAL/issues/HAL-18176#comment-a9fd2f04-6e31-425c-8ec9-971be232cd19)); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dV8bpG6CmlDwm3Py8dQsrTewk2a1rYTq+VClYAGUroKhBa5Lp2M491bUIbHSc1MSgKeiIPmmXzF1f0ekEeo5BA==

## What changes

`srt-own-loopback.test.ts` adds `describe.skipIf(!onLinux)`, so the canary is skipped on macOS and
Windows.

## Why

The canary checks that a request to a loopback port inside the srt fence reaches the fence's own
server and never the host's. srt builds that fence (its own network namespace and loopback) only on
Linux; on macOS and Windows there is no srt loopback to test, so the test could only fail for the
wrong reason or pass without checking anything. The sandbox CI job runs it on Linux.

## Covers

- packages/adapters/sandbox-srt/fence/srt-own-loopback.test.ts
