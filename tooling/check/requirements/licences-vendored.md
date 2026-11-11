# check.licences-vendored

- Status: active
- Since: 0.1.0
- Source: HAL-6167

If a file under `packages/` or `apps/` has a third-party licence in the comment block at its top (an `@license` tag, the Mozilla Public License, a GNU General Public License, or an `SPDX-License-Identifier` other than `Apache-2.0`) and isn't on the `vendored` list of `tooling/check/licences.json`, or a `vendored` entry lacks a field, names a file that is gone, or has no licence text in `tooling/check/licence-texts/`, then `pnpm check:licences` shall fail and name the file. `pnpm check:sbom --notices` shall add one block per `vendored` entry, with its name, path, licence, source and licence text, to `THIRD-PARTY-NOTICES.txt`.

## Examples

- Given `packages/core/std/src/psl.ts` with an MPL-2.0 header and no entry,
  then the check fails on that file.
- Given the same file with a complete entry and `licence-texts/MPL-2.0.txt`,
  then the check passes.
- Given an entry whose file was deleted, then the check fails and says the file is gone.
- Given an entry under `MPL-2.0` and no `licence-texts/MPL-2.0.txt`, then the check fails.
- Given a file whose header says `SPDX-License-Identifier: Apache-2.0`, then the check passes.
- Given a script whose code, below its header, writes an MPL header into another file,
  then the check passes.
- Given a file with the MPL header under `tooling/`, then the check passes.
- Given one vendored entry, then the notices end with a block for it that has its source and licence text.
