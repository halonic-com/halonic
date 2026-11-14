# Decision: the sandbox fence jobs also run the run checkout attack tests

- Task: HAL-9158 (part 3 of HAL-3125)
- Approval: the task asks for this change; Liam approves this note in his review of this pull request on HAL-9183
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QrVa0F3x2wAp+1DV0TLzEh1lR1/ov6HN0Bpe2UYUBB1M/Ejxm1+a1XygA9EfdGjJ1E269oQX9cHJYe0aAdU1Dw==

## What changes

In `.github/workflows/ci.yml`, the `sandbox-fence` area now also matches `packages/adapters/git/`, and
both fence jobs (Linux bubblewrap and macOS Seatbelt) get one more step: `pnpm test:fence` in
`packages/adapters/git`. Nothing is removed or relaxed, and the jobs get no new secret or permission.

## Why

The new tests start a program in a real sandbox session on a real run checkout. They can only pass
where the fence starts, which our containers and the ordinary test jobs aren't, so they run in the jobs
that already prepare the fence. Without the area change, a change to the git adapter alone would skip
them.

## Tests

No test was weakened. Six new tests run in the fence jobs.

## Covers

- .github/
