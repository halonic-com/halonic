# Decision: Home and Runs empty lines point to the workflow's Run button

- Task: HAL-12371
- Approval: team decision under the HAL-2282 rule for small wording on an approved screen (row L14 of Sofia's UX check on HAL-12363, microcopy revision 109 on HAL-751); Liam reviews the pull request on HAL-12371 and signs this note
- Kind: user-visible

## What changes

Where a workflow's page has **Run** (the desktop app, which has an engine), the empty lines say to press it instead of using the command line:

- Home, Recent runs note: "Studio shows what your agents are doing and lets you read each run. To start one, open *Weekly report* in Workflows and press **Run**."
- Runs, under "No runs yet": "To start one, open *Weekly report* in Workflows and press **Run**. Runs started from the command line show up here too."
- No workflow, in both places: "This workspace has no workflows yet. Add one in Workflows, then press **Run** on it."

*Weekly report* is the first workflow in the Workflows list's order, as HAL-10128 picks it, shown as a link that opens its page. While the names load or can't be read, the sentence says "a workflow" in place of the name. A served Studio and the phone keep today's `halonic run …` lines, and the Acme sample keeps its Inbox line (HAL-12225).

The UX check's Runs line starts with "A run is one time a workflow or agent does its job." The Runs page already says that sentence right above "No runs yet", so the empty line leaves it out rather than say it twice.

The requirements `runs.home` and `runs.list` gain these cases, and the command line cases are kept for a page without **Run**. No test was weakened or skipped.

## Why

A workflow's page has had **Run** since #3505, but the empty lines still said to use the command line, which told new users Studio can't start a run.

## Covers

- runs.home
- runs.list
