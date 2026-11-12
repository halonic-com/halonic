# Decision: the requirement guard asks for the guardians on a trust-root change

- Approval: CTO decision on HAL-8142, 12 Nov; changes a trust root, so the two guardians sign it
- Kind: user-visible

The note check (`Guard notes`) already asks for the guardians' signatures when a pull request changes one of the guard's trust roots. The requirement guard asked the same approval lookup without that flag, so a note with one signature went through the per-kind keys instead. Now both guards decide it the same way, from the changed files, not from the note's Covers list. A change to `policy.json` in `extraExports` only still needs one approver.

## Covers

- tooling/check/
