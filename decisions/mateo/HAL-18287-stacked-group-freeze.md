# Decision: a stacked merge group freezes main only when main's push run is red

- Task: HAL-18287
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18287 (Chief found the false freeze in shadow mode on HAL-17912, 25 Nov 07:58 UTC; Liam approves this note in review)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xU2hdnC3pDeQhE6RKkwqcscf0l02Wkk1hl556KG6EJP6V75HUKcIUEUwkik3kRwjgGEvNaB5rwATKwdHjqn3Bg==

`paperclip.merge-control-main-broken` changes for a merge group built on other merge groups.

- The files that count as "this pull request's" are its own and those of every pull request ahead of it in the group chain. The chain follows each `gh-readonly-queue/main/pr-<n>-<base>` branch's base to the merge group whose head it is, until a base is no group's head (main's tip). A named file that a pull request ahead changes makes that pull request the culprit; it is held once it is out of the queue, and the stacked group's own pull request isn't.
- A group with pull requests ahead of it that none of them explains freezes only when `main`'s newest finished push run is red. When that run is green, or wasn't read, the pass logs `main-broken suspected, not frozen (main push <sha> green)` once and holds the group's own pull request, as the culprit rule did before HAL-17884. A group directly on main's tip freezes as before.
- A pull request ahead with more changed files than were read keeps the culprit hold and freezes nothing, like the existing rule for the group's own pull request.
- Why: on 25 Nov merge group run 45568740658 (#5994) was built on #5969's failed group and failed the same way. Only #5994's own files were compared, none matched, and shadow mode would have frozen the whole queue while `main`'s push run on `25041db` was green.
- The existing examples and tests stay as they were; the new cases are in `main-broken.test.ts`.

## Covers

- paperclip.merge-control-main-broken
- paperclip.merge-control-culprit-hold
