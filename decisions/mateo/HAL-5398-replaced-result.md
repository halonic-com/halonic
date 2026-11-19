# Decision: the folder-only deny rule states the measured result for a replaced denied file

- Approval: Liam's follow-up on HAL-13155 (review of PR 3672); Liam approves this note in review
- Kind: internal

## What changes

- The Decision section of `sandbox-srt.windows-folder-deny` said a replaced denied file gets its folder's access. The fence run on Windows CI measured the opposite: the new file was still refused (`EPERM`).
- The section now states the measured result, says it is observed and not relied on, and keeps `reads-open-by-default` as the limit that covers the case.
- The requirement's statement and Examples don't change.

## Why

The requirement should say what the fence test measured, not a guess made before the run.

## Covers

- sandbox-srt.windows-folder-deny
