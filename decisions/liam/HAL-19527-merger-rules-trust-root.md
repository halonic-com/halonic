# Decision: the manifest list covers the build scripts' imports

- Approval: HAL-19527 (from the second reviewer's review of #6465)
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:p0Anb+bD0WPVj9+aqYDrrLWUinTcgpjaqUgFpgUegJSSwq0ltG5i8vhNhgecJeEEBlMW5J3Ou1glrg/98wDlAg==

## What changes

`paperclip.manifest-closure` now names the build scripts' whole runtime import closure instead of a
fixed list of four build files, and says the build scripts don't import the merge rules. The merge
rules' hash placeholder moves from `merge-control/decide-file.ts` to `merge-control/rules-hash.ts`,
a module with no imports, so `plugin/build-options.ts` no longer pulls the merge rules into the
process that writes `dist/manifest.js`. `rules-hash.ts` joins `manifestImports`. A new check fails
when a repo file the build scripts run is missing from `manifestFileOf`, and another fails when a
build script imports the merge rules. A new example shows it.

The rule gets stricter: more files need Julian's approval as manifest files. One test changes:
"manifestImports names only modules in a closure, and the build files" becomes "…, and the package
file". It now counts the build scripts' closures as closures, and its four checks that each build
file exists become one for `tooling/paperclip/package.json`; the new closure check asserts that each
build script is in its own closure, so coverage holds. No test is skipped or deleted.

## Why

The build scripts ran the whole merge rules' top-level code while writing the manifest, yet only
the four build files were listed. Moving the placeholder keeps that closure small, and the check
keeps it listed.

The other half of HAL-19527, the Merger's rules leaving the routine reviewer's scope, is already on
`main` through `paperclip.routine-review` (HAL-19283, which excludes all of `merge-control/`); this
change adds only a test case for `merge-control/fill.ts` there.

## Covers

- paperclip.manifest-closure
