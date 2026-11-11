# Decision: a process-starter entry can merge before its code

- Approval: [HAL-5884](/HAL/issues/HAL-5884)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:bAaCaaW4y/nxRm2rm742kaxLVtgww8gwNnD7T7NvZQQmRjVGnNVWl4h8rPkfOzUNW32w9U0l8PaTb1LctwJ4DA==

Since HAL-5221, CI runs `process-starts` with the base commit's
`process-starters.json`, so a pull request can't approve its own process
starter. But the rule failed an entry whose file doesn't exist, so the entry
couldn't merge first either: no new process starter could land at all.

The rule now only warns about an entry whose file doesn't exist, and doesn't
check its `scriptsTest` until the file is there. This matches
`dependencies.json`, where an unused entry is a warning. An entry whose file
exists but no longer starts a process is still an error, and so is an entry
with no reason. Once the code lands, the entry is checked in full.

The pull request also adds the entry for
`packages/adapters/sandbox-srt/src/kept-grants.ts` (HAL-5884, #1864), which
starts only `srt-win.exe` from sandbox-runtime's vendored folder with fixed
arguments. Its code follows in #1864.

The "flags a stale entry" test loses its "doesn't exist" half; the new test
"only warns about an entry whose file and test don't exist yet" covers that
case.

## Covers

- tooling/check/
