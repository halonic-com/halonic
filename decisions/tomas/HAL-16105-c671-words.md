# Decision: C671 wording for the stopped program's line, the Routines sentence and validate's near id

- Approval: the task HAL-16105 asks for these changes, from Sofia's words check C671 (rows 28, 50 and 56). The team decides them under the HAL-2282 rule, since they reword lines that are already there, for the same cases. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:Ygq3Gv7Hg9nds2RFie3scD9uWKC119jGggB6XY7EfXu1lWE058daM/kr4qE5aErSKeTDEC0WQWx2i+VPhi2ODg==

## What changes

- `library.listed-tools-waiting`: on a connector's page, the line for a program that stopped right after it started, where the agent host gives the line to run by hand, changes from "… in a terminal. The line below doesn't set its env or secrets, so set any it needs first:" to "… in a terminal. The line below leaves out the connector's environment variables and secrets. If the program needs them, set them in the terminal first:" (C671 row 28). The requirement's text and its example change to the new words; the line in the CommandBox, and when it shows, stay the same. The changeset `connector-program-line-env-windows.md` says the same.
- `workspace.routines`: a routine whose workflow or agent isn't in its hub, with a near id, changes from `Weekly report: weekly-reprot isn't in this workspace. Pick another workflow for run.workflow. Did you mean weekly-report?` to `Weekly report: weekly-reprot isn't in this workspace. Did you mean weekly-report? If not, pick another workflow for run.workflow.` (or `agent` and `run.agent`; C671 row 56). Without a near id the message stays as it is, so the parity cases and the entry `routine-target-missing-says-the-fix` stay. The code, the key path and the line stay the same.
- `routines.list.rows-and-states` (draft): the Routines list's sentence and its empty state say "A routine starts a workflow on its own" in place of "a workflow or an agent" (C671 row 50).

## Why

Row 28: `env` is the file's key, not a word a reader knows, and "its" could be the program or the file. Row 56: every other near-name line in the CLI puts "Did you mean" straight after the problem and the general fix after it. Row 50: every agent routine on the same screen shows **Can't start** with "Halonic can't run an agent on its own yet", so the header promised what the rows take back. "or an agent" comes back when the agent loop lands, as in C557's webhook how-to.

## Tests

No test was weakened or skipped. `listed-tools-load-failure.test.ts`, `listed-tools-waiting.test.tsx`, `routines.test.ts`, `references.test.ts` and `routines-page.test.tsx` check the new words in place of the old ones.

## Covers

- library.listed-tools-waiting
- workspace.routines
