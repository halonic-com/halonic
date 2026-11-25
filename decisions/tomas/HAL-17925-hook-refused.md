# Decision: a group whose jobs the runner hook refused is not a culprit

- Task: HAL-17925
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17925 (the board session installed the rule on the live Merger on 25 Nov 00:53 and corrected it at 01:25, HAL-17891 item F; Liam approves this note in review)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+vN6bf+U0ZImGbo9azWrbciM+NeB+m7mjQuL+3dBFCLYcBUB55pDkE1jWmiXOi9+qPS5ZkIZf42r7GhHfbtFAw==

`paperclip.merge-control-culprit-hold` gets a second exception: a merge group whose jobs our runner hook refused holds nobody.

- The new requirement `paperclip.merge-control-hook-refused` defines it as the live Merger's `pass.js` and `stats.js` do since 25 Nov 01:25. Every failed job other than `ci-ok` has a failure annotation titled `halonic-ci refused this job`. Then the pull request isn't held or told, no flake is lifted, main isn't recorded as broken, and the stats count the group as cancelled (`cancelled N (hook-refused M)`). One real failure next to the refused jobs, or a job whose annotations weren't read, keeps the old culprit hold.
- Why: the hook refuses the jobs of a group that has already left the queue, and the run ends red. On 22–24 Nov six such runs held or counted pull requests that had done nothing wrong.
- The culprit-hold examples and tests stay as they were; the new cases are in `refused.test.ts`.

## Covers

- paperclip.merge-control-culprit-hold
