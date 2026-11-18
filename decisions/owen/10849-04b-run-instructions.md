# Decision: the Studio's harness runs get their instructions, and the trust check

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10849 (board's yes on HAL-11378: the Studio runs harness agents in 0.1)
- Kind: user-visible
- Signature:
- Task: HAL-10849

`studio.engine-service` changes in two places:

- A harness run in the Studio now starts with the agent's `AGENTS.md` and its skills, as a CLI run
  does. The page can't write Halonic's data folder, so it sends the texts to the agent host, which
  writes them read-only in a new folder there and pins them. Whether a person trusted those
  instructions is checked in the page, against the records the shell keeps (the same ones the run
  page's "Trust" saves). A run whose instructions aren't trusted doesn't start. Before this, a
  Studio harness run had no instructions, so there was nothing to check.
- The routine sentence (from HAL-12171) said a routine that starts an agent is refused as
  `unavailable` "until agent runs are built". That still holds, but with an agent host running, a
  routine's agent in a harness now passes the check before the engine opens and is refused when
  the engine is asked to start it. The sentence now says so (Liam's note on #3518).

No test is weakened or removed. A new routine test covers the agent host case.

## Covers

- studio.engine-service
