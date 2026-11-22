# Decision: runs send prints the on-hold line, and the HTTP secret line names no commands

- Approval: /HAL/issues/HAL-15837 (C636 items 4 and 5 in HAL-15823, decided by Liam; words checked by Sofia on HAL-15847, a team call under HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9ntpHi6tGzmzZvJutUVzYy5Wc4kyypy8XBeVqBVSt9L8AKIHiPtjZvA549abSRIBE7TTAOx/czQcY//Hxab3BQ==

`halonic runs send` opens its own engine and can start an agent on this computer, as `halonic run`, `halonic serve` and `halonic routines watch` can. Those three print a `!` line for each agent set to "On this computer" or on hold since its file changed; `runs send` printed none. The agent on hold never ran outside the sandbox (the engine checks the file on every path), but the user wasn't told. The HTTP connector secret line on the Library's connector page listed only `halonic run` and `halonic routines watch` as the runs that use the secret, so it left out `runs send` and would go stale with the next command.

- cli.commands.runs.send: adds one sentence: each agent of the run set to "On this computer", or on hold, gets its `!` line before the event is sent and before "✓ Sent", in the words of `halonic run` (`cli.sandbox-gate-on-hold`). One example is added for an agent on hold. Nothing else in the requirement changes.
- library.http-connector-secret: the desktop app's first line becomes "…so only runs you start or continue with halonic in a terminal use <name>. …" and the last "Or set HALONIC_SECRET_<NAME> in the terminal you run them from.", so it no longer needs a list of commands. The browser and phone lines are unchanged.

No test is weakened. `send-follow.test.ts` gains an end-to-end test on Acme that fails without the fix. `http-connector-secret.test.tsx` changes only the two quoted sentences.

## Covers

- cli.commands.runs.send
- library.http-connector-secret
- apps/cli/src/commands/runs/send-follow.test.ts
- packages/studio/features/library/src/ui/http-connector-secret.test.tsx
