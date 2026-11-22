# Decision: a start the shell refuses after Remove trust closed the folder offers Review

- Task: HAL-15695
- Approval: a team decision under HAL-2282: it reuses the untrusted refusal and its **Review**, both already approved (H16, C144 RT1), for a refusal the person can only fix by trusting again. Follow-up of Sofia's check question on HAL-15683 (words check C613, row 33). Liam signs at review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2VJ75Ux2ghNR7ta10lI3dMYqnqFBBiicTGNJFnkwKHH6LmktP0ACxkvtnW0vwNDvzppZxnbwCDMw2qdeT5r9Aw==

## What changes

- `studio.untrusted-starts-nothing`: Remove trust closes a folder that a trust grant opened (`trust-grants`), so a page still open on it can get the shell's `folder_not_open` before the engine's own check (the engine isn't open yet) or in its place (an open engine on a workspace that reaches only the test model). When a start, an answer or a chat send gets that refusal and the last trust check found the workspace not trusted, the engine now gives the `workspace.untrusted` refusal, so the page offers **Review**, and trusting again opens the folder again. While the workspace is trusted, the refusal stays S4's failure Halonic can't explain (#4822). One new example says so; the existing examples and tests don't change. New tests cover the engine not open yet, the lock refusing first (Try it's way in), an open engine whose workspace needs no trust (Run again and an Inbox answer), and a trusted workspace keeping the shell's refusal.

## Why

The refusal really means "not trusted", and **Review** is the one thing that fixes it. "Halonic ran into a problem it can't explain yet." with **Copy details** was honest but no help. The engine can't read the folder for a new trust check, so it asks the last one, which is a no after Remove trust. The run-time trust rule doesn't change: nothing starts that didn't before.

## Covers

- studio.untrusted-starts-nothing
