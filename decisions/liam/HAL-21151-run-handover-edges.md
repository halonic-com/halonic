# Decision: `run`'s hand-over to `serve` says the right thing at its edges

- Approval: /HAL/issues/HAL-21151 (Julian's review of #6949; point 3 decided by Liam on the task; the signature is the reviewer's, since Liam wrote the pull request)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:pZnX5RKhiN7FRKk5uln+Rr3bDglFsshrJboRLhIEATXAdFub3yZfCMU5pHqXQbNpB2XkxVj1K833nHZolPo3Bg==

Julian's review of the hand-over (#6949) found three edges where `halonic
run` told the person the wrong thing, and none of them lets anything run
unchecked:

- A trust check that throws in `serve` closed the console connection with
  no answer, so `run` printed the lock's refusal. `serve` now answers it as
  a start that failed, as its start route does, and logs the error: `run`
  says "halonic serve couldn't start the run." and points at `--debug`.
- A start that took `serve` over 10 seconds looked like no `serve` at all,
  so `run` printed the refusal, whose fix gives a second run. The console
  call now tells "took the request but gave no answer" from "nothing
  listens", and `run` says the run may have started and points at
  `halonic runs list`.
- The started line promised a question on the phone that a run `serve`
  stops once it's going (instructions nobody trusted) never asks. It now
  says only "✓ Started in the running Studio as run 01jd8q."; the
  `runs show` line stays. Checking instruction trust in `run` first would
  copy the engine's per-agent check into a second gate that can drift.

`cli.local-engine-lock` changes with them: its started line and example
lose the phone sentence, a failing trust check counts as a failed start,
and a late answer gets its own lines and example. `runtime.console-socket`
gains the caller's side: it tells no server from a server that didn't
answer. The started-line tests change their expected text with it; no test
is removed or skipped. `run` also counts the 4 KB console limit without
the line end, as the socket does, so a request of exactly 4096 bytes goes
through.

## Covers

- cli.local-engine-lock
- runtime.console-socket
