# Decision: `halonic runs show` names a wait step's answer by its label too

- Task: HAL-15106, the follow-up to HAL-15090 (#4471)
- Approval: decided by the team on HAL-15106, following the HAL-15090 decision (wording on an approved screen). Liam signs on review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:RUJlvguMZn1TCWBjqmhOjRyrR6XGAn1KbpBaZ0eVsyrAaOYW23tIt3qzng2jb3d4Sm02Pz8RFiXGKQlIL7U1Cg==

## What changes

- `cli.run-view`: a wait step's line names an answer other than approve or reject by the label the
  step gave that event, as Studio's Every step does after HAL-15090: "! Approve this reply? you
  answered Send to a manager at 14:02". An answer with no label still reads by its event. Approve
  and reject keep "you approved" and "you rejected". One sentence of the requirement and one
  example change; the label is read from `app.run-steps`, so only the step's own labels count.

## Why

`app.run-steps` says the command line's step lines and Studio's Every step say the same about a
run. After HAL-15090 Every step read "You answered Send to a manager" while `halonic runs show`
still read "you answered escalate". Nothing is removed: a log without labels reads as before, and
no test is weakened.

## Covers

- cli.run-view
