# Decision: the Runs requirements follow microcopy revision 99

- Task: HAL-9381, from Sofia's design check (HAL-9316) and her comment on the task
- Approval: Liam, in review of HAL-9381 (his signature is added there)
- Kind: user-visible

## What changes

- `runs.run-page`: the waiting banner is violet (the warning token, "your turn"), not amber; the
  approval example reads "Waiting for your approval. *Reporter wants to send an email with
  Gmail.* Nothing is sent until you decide."; a catch-up run gets a sentence under the header line
  (new requirement text and a new example). The budget banner stays amber.
- `runs.search`: the short id in a run hit is lowercase, "Run 01jd8q · Support reply", as the
  Runs list shows it.

## Why

Sofia's microcopy revision 99 (15.1, 15.2, 3.3) is the approved wording; these two requirement
files still had the older words. The change is team-decided small wording on approved screens
(HAL-2282). No behaviour is removed, and the code changes are in the pull requests of HAL-9381.

## Covers

- runs.run-page
- runs.search
