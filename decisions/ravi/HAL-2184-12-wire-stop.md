# Decision: Ctrl C and SIGTERM wired into every command

- Requirement: `cli.stop` (`apps/cli/requirements/stop.md`)
- Task: HAL-2184; PR 4's checklist (F4 and the review of #758 on HAL-2618), and cli-output 1.5 at
  revision 34
- Approval: the maintainer approves this note in review

## What changes

`cli.stop` now says where the stop line goes and what a second signal does, as cli-output 1.5
says since revisions 19 and 34:

- The stop line goes to stderr, after the live line is cleared: it says the command was
  interrupted, it isn't a result.
- With `--json`, stderr stays empty and stdout holds the command's one document with
  `"ok": false` (cli-output 1.8: one document, human text goes nowhere). A second signal
  with `--json` writes `{ "outputVersion": 1, "ok": false }`, so stdout is still one document;
  no new field is added.
- A second signal clears the live line, prints only "Stopped." and exits with **that second
  signal's** code. The old sentence said "the same code", which read as the first signal's.
  Revision 34 settled it: the signal that ends the process names the exit. `watchForStop`
  already did this; only the words change.
- A first signal while a yes-or-no question (`cli.questions`, from #1010) waits for its answer
  ends the question: the CLI stops reading stdin, ends the `[y/N] ` line, and the command
  gets the `AbortError`, so "Stopped." starts its own line. Without this the question kept
  waiting after Ctrl C. Asked for in the review on HAL-3473.

Three examples are added; none is removed or changed.

## Tests

No guard was weakened. The fake signal source moved from `stop.test.ts` to
`src/test/fake-signals.ts` unchanged, so `runCli`'s tests use it too. New tests run commands
through `runCli`: 130 and 143, `--json`, a command that throws once stopped, both orders of a
second signal, the listeners removed afterwards, the stop line after the cleared live line, and
Ctrl C during a question. `LineReader` gets a test that an aborted read stops and keeps what was
typed.
