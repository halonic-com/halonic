# Decision: the images rule fails on an ADD source holding a variable, and covers Containerfile

- Task: HAL-18565
- Approval: a trust-root change by Owen, following Liam's review of #6090 (HAL-18533); Julian and Liam sign as the two guardians
- Kind: internal

## What changes

- The `images` rule fails on an `ADD` whose source contains `$` (`ADD ${URL} /x`,
  `ADD https://acme.example/tool-${VERSION}.tgz /x`). Such a source wasn't treated as remote, so a
  download hidden in a variable passed without a checksum or a listing. The message tells the
  author to write the URL or path out. A variable in the destination stays allowed.
- `isDockerfile` also matches `Containerfile`, `Containerfile.*` and `*.Containerfile` (Podman's
  names), and skips `.containerignore` as it skips `.dockerignore`.
- Requirement `check.image-contents` and `docs/guides/dependencies.md` say both.

## Why

Both close gaps in a check that guards what the run container may hold: a variable source and a
`Containerfile` were two ways for a download to skip the list without anyone meaning to.

## Tests

No test was skipped, weakened or deleted. `tooling/check/src/test/images.test.ts` adds three
tests: a variable source fails (three forms), a variable destination passes, and each
`Containerfile` name needs an entry. The first and third failed before the fix.

## Covers

- tooling/check/
- check.image-contents
