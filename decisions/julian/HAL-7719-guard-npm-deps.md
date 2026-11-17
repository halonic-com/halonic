# Decision: the guard's own npm package is guarded too

- Approval: HAL-7719 (Liam, CTO)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XKxj93oiCMqQUpO9/AIIBZMY2wu6cIBw9y2dlk28cTCQU79/WSbzM3y3tO/YDXhsDomtmvX3wZClg1zB79j2Ag==
- Task: HAL-7719

The requirement guard runs on the TypeScript parser `@typescript/typescript6`. Until now a change
to that package's version or its checksum in `pnpm-workspace.yaml` or `pnpm-lock.yaml` could land
without a note, because those files change many times a day and aren't guarded paths.

## Covers

- `tooling/check/`
- `check.guard-dependency`

## What changes

- A new rule, `check.guard-dependency`, reads only the lines that decide `@typescript/typescript6`:
  its catalog entry, its `tooling/check` entry in the lockfile, its package and snapshot entries
  and those of its own dependencies. A change to them needs a signed note of either kind that lists
  the file under Covers. Any other change to those two files, such as another dev dependency, needs
  nothing.
- A lockfile layout the reader doesn't know, or an entry it can't tie to a package block, counts any
  difference as a change, so a format change can't hide the package.
- `tooling/check/package.json`, which pins the package, is a trust root: a change needs two
  guardians.

## Why

A swapped or altered parser would run inside the guard with no review. Counting only the lines that
decide this one package keeps the cost low: most lockfile changes stay free.

## Known gaps

- `overrides` or `patchedDependencies` for the package in `pnpm-workspace.yaml` aren't reported in
  that file. Both change the `version:` line in the importer entry of the lockfile, which is
  reported, and a frozen install refuses a workspace file that doesn't match the lockfile.
