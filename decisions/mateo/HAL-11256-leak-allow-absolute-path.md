# Decision: an absolute-path allow entry names the root or the commit it excuses

- Task: HAL-11256
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nWp/dGf05BAooGXboaLxa0pAwcYHyp1P/7lM8a7mEl1sQ3bKnXHDoUZFe9bbnOJKkrccuyRfN8lK/R/8mE+oCw==

## What changes

In `tooling/check/leak-allow.txt`, an `absolute-path` entry now needs `root:<root>` (the root the leak guard prints, such as `/tmp/`) or `commit:<hash>` (the commit that added the path). Before, an entry excused every absolute path in a file, in any later commit. The leak guard refuses an entry with neither, and only absolute-path entries take these words. The guide `docs/guides/leak-guard.md` says so.

The seven existing entries are pinned: six test or fixture files to the roots they hold, and the old `packages/testing/parity/README.md` example to the two commits that added it. History can't be reworded, so the README entry stays, but it no longer covers a path added there later.

## Why

The guide promised that an entry "allows that one value in that file and nothing else". That held for secret rules, which carry a fingerprint, and not for absolute paths. A real local path pasted into the README would have passed the hook and CI.

## Tests

No test was skipped or weakened. `allow.test.ts` gains tests for the refusals and for an entry that matches only its own root or commit. The `--allow-file` test in `leaks.test.ts` now writes a pinned entry. The nightly scan (`pnpm check:leaks --all`) is clean on this branch, and fails on the two Windows entries when they are removed, so their `C:\\` roots match what the guard prints.

## Covers

- tooling/check/
- docs/guides/
