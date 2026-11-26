# Decision: the check's test fixtures leave out the real image list

- Task: HAL-18021
- Approval: Liam decided how `dependencies.json` records image contents on HAL-18533 (#6090); the board approved the image's contents on HAL-18117
- Kind: internal

## What changes

- `tooling/check/dependencies.json`: the `images` entry for
  `packages/targets/cloudflare/runtime/container/Dockerfile`, with the base image, the seven
  checked downloads and the four Debian packages the Dockerfile installs.
- `tooling/check/src/test/fixture-repo.ts`: a fixture repo writes `images` empty, as it already
  does for `process-starters.json`. The real list names a Dockerfile a fixture repo doesn't have,
  so every fixture-based test failed with "names a Dockerfile that doesn't exist".

## Why

The image is the run container of HAL-13211. The fixture change keeps the check's own tests
independent of which Dockerfiles the repo has. `images.test.ts` builds its own entries and still
covers the rule.

## Security

No test is weakened or skipped: the `images` rule's tests set their own list, and the real list
is still checked by `pnpm check` on every pull request.

## Covers

- tooling/check/
- tooling/check/dependencies.json
- tooling/check/src/test/fixture-repo.ts
