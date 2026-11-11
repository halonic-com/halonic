# Decision: close the Low findings on Try it programs

- Approval: Julian's security review of halonic#1556 on [HAL-4825](/HAL/issues/HAL-4825) asked for these follow-ups; Liam routed them to [HAL-3246](/HAL/issues/HAL-3246), with Liam's review of the pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:owWxLp8hnRxuEeb6IY+GilLIdi/Jxikgb0Y45Z3an4pOFThVKo1p7wW1pRpdgfAtWJ63Ul+iU3Wk2sfeztuOAA==
- Task: HAL-3246

## What changes

`app.try-it-programs-see-try-it-source` gains one case and one exclusion:

- A pinned stdio connector given an argument or environment value that could name a path
  outside its own folder is can't-try too, while a file that isn't an item is held back. A
  pinned connector runs in its own folder, but a path such as `--root=/srv/acme` can point it
  back at the workspace. The check doesn't know where the workspace is, so it fails safe:
  - any absolute path, at the start of the value, after `=` or after a short option such as
    `-r`: a POSIX root, a home folder (`~`), a Windows drive or a network share;
  - any `..` path segment, since enough of them reach the root from any folder;
  - any `file:` URI, a form some servers take for their roots.

  Matching too much only makes a step can't-try while such a file is held back.
- Held-back parts of item files, such as an agent's permissions or connectors, are not
  covered. They are on disk too, but a program only reads them as text, while what a step may
  do comes from Try it's own source. Only a file that isn't an item can be code the program
  runs.

Four examples follow from that, with tests for each, and tests for the precedence and dedupe in
`cantTryOf`.

## Why

Julian's review of halonic#1556 had three Low findings: held-back item files on disk, pinned
connectors pointed at the workspace by an absolute path, and missing tests. The first is
written down as accepted, the second is closed fail-safe, and the tests are added.

## Covers

- app.try-it-programs-see-try-it-source
