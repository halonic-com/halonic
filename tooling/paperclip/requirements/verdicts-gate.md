# paperclip.verdicts-gate

- Status: active
- Since: unreleased
- Source: HAL-19969, step 3 of 2.4 in the plan on HAL-19228, with Julian's minor 2 from his review on HAL-19481, and his review of #6636 (HAL-19992)

While the board's flag `verdictGate` is off, the merge gate and `pr_status` shall read approvals from PR comments as before, and `pr_status` shall say that the flag is off.

While the flag is on, the merge gate and `pr_status` shall count only the recorded verdicts (`verdictsFor`), never PR comments, and shall treat a pull request as not approved when:
- GitHub listed only some of its changed files, or the files weren't read;
- `authorOf` can't name its author (the branch name alone never decides);
- the author recorded the approval;
- a recorded change request holds it;
- it changes a plugin manifest and Julian recorded no approval of the change;
- any read of the records, the task's comments, the agents or the pull request fails.

A security pull request also waits for Julian's `security-ok` recorded on its exact head.

While the flag is on, a queued pull request whose records, task comments or agents couldn't be read, or whose records the pass didn't read, shall stay in the merge queue (it isn't added either), as on a refused GitHub read; a pull request whose records were read and don't approve it shall come out as before. The merge rules file (`decidePass`) shall refuse a pass with the flag on and no recorded verdicts in its snapshot.

## Examples

- Given the flag off and Liam's approval line on GitHub,
  when the gate checks the pull request,
  then it passes the approval rules as before and `pr_status` says "the board's verdict flag is off".
- Given the flag on and Liam's approval line on GitHub, with no record,
  when the gate checks the pull request,
  then it isn't approved: "no recorded approval".
- Given the flag on and Liam's recorded approval, but a branch whose agent never named the pull request on the task,
  when the gate checks it,
  then it isn't approved: "who wrote it isn't clear".
- Given the flag on, Liam's recorded approval and 3,001 changed files of which GitHub listed 3,000,
  when the gate checks it,
  then it isn't approved.
- Given the flag on, #1 queued and #3 ready, and the agents read fails,
  when the merge gate decides,
  then it removes no queued pull request and adds none.
- Given the flag on and a snapshot with no recorded verdicts,
  when the Merger hands it to `decidePass`,
  then it throws, and the Merger falls back to its own rules for that pass.
