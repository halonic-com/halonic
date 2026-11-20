# Decision: a run says the cause and chmod 600 for a secrets file other users can read

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12569 (Liam, CTO; decided in the task)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3s8mERe2rvT/+NUzFvUeaIibPoZ5tHaxX6GG130Wx+P/63rbTWHCjjXdaqU6lgCv/RTfAfhPsmsel58gAMO3Cg==
- Task: HAL-12569

With a secrets file that other users can read, `halonic secret list` said the cause and the fix
and exited 7, but `halonic run` said "Halonic can't tell the cause yet", asked for a bug report and
exited 1 (Nina's docs check, HAL-12558, P2). The cause was known; the run log only had the error's
kind, `denied`, with no code.

**`secrets-file.private`.** The store's refusal now carries the cause `secrets.file-readable` with
the file. The engine already logs such a cause on `run.failed` (`engine.run-failure-cause-of`),
after checking it holds nothing shaped like a key. The message, the fix and the kind are as before.

**`app.run-failure`.** The shared failure facts (HAL-12411) map that cause, with the file, to
`secrets-file-readable`, and count it as setup like the other two causes. Studio reads the same
facts; it has no words for this one yet, which is a change of its own.

**`cli.run-failure`.** The CLI words that cause with `secret list`'s own words:

    Support reply failed in the step Read the email: the secrets file <file> can be read by other users.
    Run chmod 600 <file>, then run again.

There is no report link. A cause without the file gets the general lines, as the other setup causes
do.

**`cli.run`.** The run exits 7 (`denied`), the kind `--json` shows in the run's `cause`, as
`secret list` exits for the same file.

`routines watch` only says a run started; a run it started that fails this way shows the same lines
in `halonic runs show`, which uses the same mapping. `serve` logs the same cause for Studio to read.

No test was removed or loosened. New tests cover the cause on the store's error, the mapping, the
two lines, and a real `halonic run` with and without `--json`.

## Covers

- secrets-file.private
- app.run-failure
- cli.run-failure
- cli.run
