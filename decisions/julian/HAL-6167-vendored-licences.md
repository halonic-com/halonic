# Decision: the licence check lists vendored third-party files and puts them in the notices

- Task: HAL-6167, on halonic#1921
- Approval: Liam decided it as the guard's owner on [HAL-6528](/HAL/issues/HAL-6528), after the exception accepted on [HAL-6165](/HAL/issues/HAL-6165), and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Px2wdCXu9kfWQN+IDgWG5KflkkgNd5xfg/EyU/4SUhSsUSM3/RcwiYTD1HzHtvAM5YDGxuOgWrAMIDaG5z6WAg==

## What changes

`tooling/check/licences.json` gets a `vendored` list, with the MPL-2.0 Public Suffix List from
halonic#1897 as its only entry, and `tooling/check/licence-texts/MPL-2.0.txt` holds that licence's
full text. `pnpm check:licences` now fails on a file under `packages/` or `apps/` whose top comment
block carries a third-party licence and isn't on the list, and on a listed file that is gone, has
an incomplete entry or has no licence text. `pnpm check:sbom --notices` adds one block per listed
file to `THIRD-PARTY-NOTICES.txt`. The new requirement `check.licences-vendored` says so. Nothing
that was checked before is checked less.

## Why

The dependency licence check only saw packages in the lockfile, so a third-party file copied into
the source, like the Public Suffix List, passed unnoticed and was missing from the notices we ship.
HAL-6165 accepted that one MPL-2.0 file as an exception, on the condition that it is listed and
credited; this change makes the check enforce both, for it and for any file copied in later.

## Covers

- check.licences-vendored
- tooling/check/
