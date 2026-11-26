# Decision: install the git hooks outside the working tree

- Approval: the task asks for this fix (HAL-19321); Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KpWRvHvwy0faPxiuJ2glDeihUJY5HRDAAJZl+VuQHkukBY7F5LpcQfcgcgcUisG0ZlNhOmlhUqp3jdrsSUDHBQ==

## What changes

- `install-hooks` copies the hooks (`pre-commit`, `pre-push`, `run-leak-guard.sh`) from the tree `pnpm install` runs in to `halonic-hooks/` under the git common dir, marks them executable and points `core.hooksPath` there with an absolute path. It copies them afresh on every install.
- A `core.hooksPath` set to anything else is left alone; the old in-tree value `tooling/check/hooks` (relative or absolute) is replaced.
- The hooks run the leak guard from the repo root's `tooling/check`.
- The docs and the root `AGENTS.md` say `core.hooksPath` prints the `halonic-hooks` folder in the clone's git dir.

## Why

A checkout should never change which hooks git runs. With the hooks in the git dir, only `pnpm install` updates them.

## Tests

`install-hooks.test.ts` covers the copy and its file list, the fresh copy on every install, a checkout that brings its own hook (not run, and run with the old in-tree path as a control), the old path replaced, a foreign path kept, and nothing installed in CI. `hooks.test.ts` follows the hooks' new way of finding the guard.

## Covers

- tooling/check/
- docs/guides/
