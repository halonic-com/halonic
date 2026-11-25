# Decision: the Merger's rules file is named for its own hash, and checks setting types

- Approval: HAL-18337, Liam's review of #6050 (two points for the next PR); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jz+3RxKKiD3UG+DP04u4ytcyDjfUgU6TkFHRi7xOrGQsIezrFHt6TSolP34FViGBnAhk9eGQMR5y+Hu/xetrBw==

## What changes

`paperclip.merge-control-decide-file` (merged in #6050, not released) changes in two ways:

- The file `build:plugin` writes is `dist/merge-control-decide-<version>-<hash>.js`, and `rules` in
  every answer is `halonic.agent-tools@<version>+<hash>`, where `<hash>` is the first 8 hex digits
  of the bundle's SHA-256. Before, both named the version only.
- `decidePass` also refuses a setting whose type differs from its default's (a number, a string,
  or a list of strings). Before, it checked only the setting's name.

## Why

One plugin version ships many rule changes, so `0.10.0` alone doesn't say which rules decided,
and the task's "decisions from plugin version X for a full day" couldn't be checked. A setting
of the wrong type, such as `fillTarget: "15"`, would have reached the rules unnoticed.

## Tests

`tooling/paperclip/src/merge-control/decide-file.test.ts`: the name test now expects the hash,
and new tests cover equal names for equal bundles and the three wrong types.

## Covers

- paperclip.merge-control-decide-file
