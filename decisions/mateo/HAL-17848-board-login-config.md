# Decision: merge control reads the board's login from config, not from code

- Task: HAL-17848
- Approval: the board's rule on HAL-16851 (24 Nov): code that must recognise the board's GitHub login reads it from config, never a hard-coded value; HAL-17848 applies it to merge control
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DgcEj6eRnxAkn2Bpdo+dac3tyPtEU6+33k4EGWW5ikrEQIHWYMJ93nINv+MGOtdfIgqUI8isTxFOU1sdOvfqDA==

## What changes

- `tooling/paperclip/src/merge-control/state.ts`: `defaultSettings.fastTrackLabellers` keeps only
  `halonic-dev`. The board's login is added from the plugin's config when merge control is wired
  in; today nothing outside the tests reads `defaultSettings`, so no behaviour changes.
- The requirement `paperclip.merge-control-fast-track` names "the board's login from the plugin's
  config" where it named the login, in the rule and in its first example. What the rule does stays
  the same.
- The tests use an invented login, `board-member`, through `testSettings` in the test helper, as
  the fast-track tests already do.

## Why

The leak guard's personal terms now include that login, and the merge queue scans the whole tree,
so the six lines on `main` failed the Leak guard job of every merge group on `2624b2a`.

## Tests

No test was skipped or weakened: the same 82 merge-control tests run with the same `expect`
calls; only the login they label with changed.

## Covers

- paperclip.merge-control-fast-track
