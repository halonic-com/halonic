# Decision: the page's engine starts runs from the live version

- Approval: the plan for this change is approved on HAL-14229 (Liam's comment of 22 Nov, Q1 to Q3 and conditions); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/4xoYIZ/GQ5YkI/z+O3LbAHbpEvfTJoCNvgidjvI5tnS+5w0j4VW/ijCNOrh221OVIsOT7AXJ6VoBnls0vJwBw==
- Task: HAL-14229

## What changes

`studio.engine-service` changes from "every run the page starts reads the saved files, and a run of the
live version starts no program" to the CLI's rule (`app.runs-read-latest-version`): Run, the Inbox form,
Run now and routine runs start from the live version, or the saved files with history off, and record it.
A run's definitions, its connectors' files and its harness agent's file come from that version, and trust
is checked on that load. A live version that isn't trusted is refused even when the saved files are.
Nothing live is refused as `conflict`, and git missing in a workspace with history as `unavailable`, both
in the CLI's words.

Two refusals change with it. An Approve of a connector's tool call is now sent for a run of a commit too,
not only for one of the saved files; one that records no version is still refused
(`engine-service-send.test.ts`). And a live-version run's connector programs start in the workspace
folder: the page has no copy at a commit yet. The requirement says that the trust check covers the
version's connector files and commands, not the program files on disk, and HAL-16260 follows it up. The
gap was approved on HAL-14229 (Q3).

It also builds on HAL-16324, which made every start, send and routine's start read the files as saved
then. That rule now reads the version a start reads then: the live version, or the saved files with
history off or while nothing is live. So with history, the engine's models, budget, trust check and Local
only come from the live version, and a saved change of Local only reopens the engine only once it is made
live. HAL-16324's three examples now say "history off", the case they test. The budget is the one the
latest start read.

## Why

In the Studio, a saved change counted before it was made live, which the CLI never does (HAL-14229). Once
the page's runs record the live version, refusing their Approve, or their connectors, would break every
run whose agent lists a connector.

## Covers

- studio.engine-service
- apps/studio/src/engine/engine-service-send.test.ts
