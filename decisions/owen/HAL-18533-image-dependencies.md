# Decision: dependencies.json lists what each container image may hold, and a check enforces it

- Task: HAL-18533
- Approval: a trust-root change written by Owen on Liam's decision (option A) on HAL-18533; Julian reviews first, then Julian and Liam sign as the two guardians
- Kind: user-visible

## What changes

- `tooling/check/dependencies.json` gets an `images` section, keyed by a Dockerfile's path from the
  repo root: its `base` image (full `FROM` reference with digest, and a reason), its `artifacts`
  (`version`, `sha256`, `url`, `reason` or `partOf`, `approvedOn`) and, optionally, the Debian
  packages it installs (`aptPackages`). The section is optional and left out here (no Dockerfile
  under `packages/` yet): the merge base's copy of the guard reads this file strictly and would
  refuse a key it doesn't know. #5907 adds the first entry.
- A new rule, `images`, fails on a Dockerfile under `packages/` without an entry, and for a listed
  one on: a `FROM` without a digest or other than `base`; a remote `ADD` without
  `--checksum=sha256:`, not listed by URL, with a different sha256, or whose URL doesn't contain the
  listed version; a listed artifact no longer downloaded; a `RUN` with `curl`, `wget`,
  `pnpm`/`yarn`/`pip` install or `npm install` without `--offline`; a `RUN` that installs an
  unlisted Debian package. Dockerfiles under `infra/` and `.github/` are out of scope for now.
- `tooling/check/src/lib/config-files.ts` reads the new section. Its strict-reading helper `Place`
  moves unchanged to `tooling/check/src/lib/place.ts` so the new `image-list.ts` can use it. Both new
  files join the trust roots in `tooling/check/src/guard/note-check.ts`, because the guard commands
  import `config-files.ts`.
- Requirement `check.image-contents` (new) and `docs/guides/dependencies.md` describe the rule.

## Why

The board approved Claude Code, Codex and srt for the run container image only (HAL-18117). The run
container runs user code, so a version bump must not slip in unchecked. A list in an `AGENTS.md`
(option B) would not catch the next bump. `npm install --offline` is allowed because #5907 uses it to
unpack the tarballs an `ADD --checksum` already fetched, and with `--offline` it can fetch nothing.

## Tests

No test was skipped, weakened or deleted. `tooling/check/src/test/images.test.ts` adds eleven tests
on invented `acme` Dockerfiles: one passing fixture, and one for each failure above.

## Covers

- tooling/check/
- check.image-contents
