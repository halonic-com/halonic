# Decision: the merge queue scans the whole tree for personal terms

- Task: HAL-11881
- Approval: Liam approves this note in review of PR #3403
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xbSu6cMPxb1jaSYAb364ON7sgN1ZaOcnmVqPmXomsVw8wEPRkWdpHoCf+NP04LfF9R9D8kRog2TCvHJUCUpfBg==

## What changes

In `.github/workflows/ci.yml`, the leak guard step of a merge-queue run also scans the whole tree that
would land, after the range scan it already does. Nothing else in the workflow changes: no trigger,
right, runner or secret, and the range scan itself is as before.

## Why

A range scan reads only the lines a change adds. Two hits that were already in the tree passed the
merge queue and first failed on the push to `main`. Scanning the tree in the queue stops a hit before
it lands.

## Tests

No test was weakened or skipped. No term is added to the allowed phrases.

## Covers

- .github/
