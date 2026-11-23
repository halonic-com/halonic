# Decision: Local only saved on counts before it's made live

- Approval: option 1 of the plan is approved on HAL-16400 (Liam's comment of 22 Nov, with four conditions); Liam approves this note in review
- Kind: internal
- Task: HAL-16400

## What changes

`studio.engine-service` read Local only only from the version a start reads, which is the live version
in a workspace with history (HAL-14229). The old text:

> When that version has turned `privacy.localOnly` on or off since the engine opened, a start or send
> shall close the engine and open a new one built with the new setting, …

The new text:

> Local only shall count as on when that version or the saved `workspace.yaml` sets
> `privacy.localOnly: true`, so turning it on takes effect at the next start, before it is made live,
> and turning it off waits until it is made live (HAL-16400); while that version has it off, a saved
> `workspace.yaml` that can't be read or has an error shall refuse the start, send or routine's start
> as `invalid_input`, with words such as "The saved workspace.yaml has an error on line 4, so Halonic
> can't tell whether Local only is on. Nothing started." and "Fix the error in workspace.yaml, then
> try again." for an error, never count as off. When Local only, counted that way, has turned on or
> off since the engine opened, a start or send shall close the engine and open a new one built with
> the new setting, …

After the sentence on a cancel, which reads no version and never refuses for Local only on an open
engine, this is added:

> When the engine is closed, though, a cancel or an answer opens it on that version as a start does, so
> while that version has Local only off, a saved `workspace.yaml` that can't be read or has an error
> shall refuse the cancel or the answer the same way, as `invalid_input` with the same words, and
> nothing is cancelled or sent until it is fixed (HAL-16400).

Three examples are added: Local only saved on but not live keeps a start and a routine's start off the
cloud model, Local only saved off but not live still keeps them off it until it's made live, and a
cancel or an answer that has to open a closed engine is refused the same way when the saved
`workspace.yaml` has an error (Liam's review of #5246). A run's definitions still come from the
version it records; only the engine's Local only is stricter. Nothing changes with history off or
while nothing is live, where the saved files are already what the engine reads.

Two fakes of `engine-service-saved-files.test.ts`, `hungServer` and `pageTimers`, move, unchanged, to
`engine-local-only.testing.ts`, and `acmeWithTwoProviders` of `engine-service.testing.ts` takes more
files, so the new tests share them. No test there changes or goes.

Words check C739 rows 11 and 12 (HAL-16658, team decision under HAL-2282) change two of Studio's
refusals in the same requirement, its example and `engine-service-live-version.test.ts`. The old text:

> a start shall be refused as `conflict` with the CLI's words, "Nothing is live yet, so there is
> nothing to run. Nothing ran." and the fix "Make a first commit in git, then run again.", … as
> `unavailable` with "git can't start on this computer, so the live version can't be read. Nothing
> ran." and the fix …

The new text:

> a start shall be refused as `conflict`, as the CLI refuses it, with "Nothing is live yet, so there
> is nothing to run." and the fix "Create a first version, then try again.", … as `unavailable` with
> "git can't start on this computer, so the live version can't be read." and the fix …

Each Studio start screen's lead already says the run didn't start, and Studio makes a commit with
Create version. The tests still check the same refusals, kinds and that no lock is taken, with the new
words. The CLI keeps its own words.

## Why

Since HAL-14229, someone who turned Local only on in Settings and saved could still get a cloud model call
from Run, the Inbox form, Run now or a routine until they made the change live (Liam's review of #5157).
Counting the stricter of the two closes that with no new wording on the Settings screen, and never lets
a run make a cloud call the person just turned off, nor one they haven't made live. A saved file that
can't be read might be turning Local only on, so it fails closed (Liam's condition 1). The CLI keeps
reading the live version only; matching it is HAL-16406.

## Covers

- studio.engine-service
- apps/studio/src/engine/engine-service-saved-files.test.ts
- apps/studio/src/engine/engine-service-live-version.test.ts
