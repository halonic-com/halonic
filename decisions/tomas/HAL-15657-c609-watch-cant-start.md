# Decision: routines watch says a broken routine can't start until its file is fixed

- Task: HAL-15657
- Approval: HAL-15657; team wording on approved command output (HAL-2282), from the words check C609 (rows 9, 12, 14, 15 and 16) of #4638 and #4708; the reviewer signs this note as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ScDoNVplPsKeJmONslnlZdpQQf3NlBfO9s0LbI48LkifE9BUEvsvLhWBBFWapK5FoauSFElMYRxxiYVBhaqiCQ==

## What changes

- `cli.commands.routines.watch`: the line for a routine whose own file has errors says
  "✕ Friday digest can't start until its file is fixed · halonic validate" (was "✕ Friday
  digest can't start · halonic validate"), in the requirement and its example.
- `cli.workspace-file-problems`: its `routines watch` example quotes the new line and says the
  watch runs the other routines on time (was "starts the other routines").
- The CLI README's `routines watch` row and `docs/security/trust.md` say the watch leaves that
  routine out and runs the others on time.
- The changesets of #4638 and #4708 get C609's words; the first one covers this line too, since
  neither has shipped yet.

## Why

C609 found that "can't start" alone doesn't say why, nor that the routine starts again by itself
once its file is fixed, which is what the watch does (HAL-15372). "Can't start" stays, as the
list and the Studio say it. "Starts the others" read as if the watch runs them right away; it
runs them when they are due.

C609's optional row 16 is left as it is: "Couldn't watch the routines in acme: …" names the
folder because every command builds that line from `--dir` before it reads the workspace, so
it can't name the workspace when reading it is what failed. Changing that is a change for all
commands, not this one.

## Tests

No test was weakened or skipped. `routines/watch-cant-start.test.ts` expects the new line.

## Covers

- cli.commands.routines.watch
- cli.workspace-file-problems
