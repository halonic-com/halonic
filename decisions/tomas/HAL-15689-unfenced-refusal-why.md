# Decision: a run says why a local integration didn't start without the sandbox, and how to allow it

- Approval: Liam approves this change on HAL-15689 (https://paperclip.halonic.com/HAL/issues/HAL-15689), from flow check C611 on HAL-15671. The words are the refusal's own (microcopy 24.1 R18, its fix decided by the team on HAL-15144) and the sandbox reasons of `app.runner-unfenced-words` (microcopy 23.3); a team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

Since HAL-15144 a local integration also starts without the sandbox when Studio's yes for the
reason is saved. When there is no yes, the `halonic` command's opener refused with a plain `Error`,
so the run log had `why: "other"` and `halonic run` fell back to HAL-15250's line: "Its integration
needs the sandbox and a trusted workspace to start. To check both, run halonic doctor". That is no
longer true, and `doctor` doesn't know the yes, so the gate's reason and fix never reached the person.

- The opener throws `UnfencedStartNotAllowedError` with the gate's reason in `sandboxReason`, with the
  same message as before.
- `connectorStartFailureOf` reads it as `unfenced-not-allowed` with the reason; the events package
  adds `unfenced-not-allowed` to the connector-start reasons, with the reason's code (`container`,
  `windows`, …) as the cause's `name`; the engine logs it. Never the message, which can name the
  yes's file. It sits next to `sandbox-not-ready` (HAL-14296), which stays as it is: that one is
  for a plugin's backend the same gate refused, has no name, and its fix is `halonic doctor`.
- `halonic run` and `halonic runs show` say "! notes didn't start, so its tools are off in this run.",
  then why the sandbox isn't available in `app.runner-unfenced-words`' words, then "Running it without
  the sandbox isn't allowed yet. To allow it, trust this workspace in Studio on this computer."
- Where a yes given in Studio doesn't reach the command (Windows with the WSL sandbox, from the
  profile's saved sandbox choice), `halonic run` leaves out the second sentence, as the refusal
  itself does since C612 (Liam's condition (b), HAL-15675), which landed on `main` while this was in
  review. `runs show` reads only the log and keeps it.
- Studio's run view has no words of its own for it yet and reads it as a connector that didn't start,
  as before; its words come with Studio's yes for integrations (HAL-15144 part 2).
- The `doctor` line for any other cause of an integration stays as it is.

## Tests

No test is removed or weakened. New tests: the reader, the events reader, the engine's cause, the
opener's error as the engine reads it, and the run's warning lines, with and without the Studio
sentence. A real `halonic run` in a
container with a trusted workspace, a local integration and no yes printed the three lines above, and
`runs show` printed the same.

## Why

The refusal already says what is wrong and what to do; the run only has to pass it on. Naming the
reason by its code keeps paths and messages out of the log, as for the other start causes.

## Covers

- ports.connector-start-failure
- events.tool-result-cause
- events.connector-listing-failed
- engine.connector-listing-failed
- engine.tool-result-cause
- cli.run-connector-warning
- cli.local-integration-unfenced-yes
