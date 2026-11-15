# Decision: the real-path resolver's tests split where Win32 and POSIX read a path differently

- Approval: HAL-10561 (Liam)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:88DRws1rSE9oGfs0C/s42JFdgMspK/5lba4cC+T6JB/oyNQY5i5y4Y7Rn6uKAEcy7Zo/0rXEi5hJEOB+OmftCA==

## What changes

The new `resolveRealPath` in `fs-node` has four tests that run on one platform only, with
`it.runIf(...)`. Each is named `[platform:win32]` or `[platform:linux]` for the platform where it is
skipped, with a reason, like `folder-trash.test.ts`. They come in two pairs. Win32 removes a `..`
from the path text before it follows links, and POSIX follows links first. So the same path gives a
different real path on each platform, and each platform gets its own expectation. No existing example
was removed or weakened. Every other resolver test runs on both platforms.

## Why

`app.ask-policy` needs the real path of a path the agent names, so a link can't hide a write to a
protected path (HAL-5397, N3). Writing the expectation for the platform where it holds is more exact
than a test that is true on one platform and loosened for the other.

## Covers

- packages/adapters/fs-node/src/real-path-resolver.test.ts
