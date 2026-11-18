# Decision: the receipt names the test model and lists wait-step answers; no Ran on without history

- Task: HAL-12727, from the in-Studio first-run check (HAL-12721 L8 and L9, findings F13 and F14)
- Approval: Liam, in review of HAL-12727 (his signature is added there)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nUZVbLdp95XeIMFdxFJX72ShZky5a3uC7yHvsw1VSh4B+TS6y2lDmnghqGLfL/wFUud+fLjwHzY7xnLi/BzzAQ==

## What changes

- `runs.run-view.receipt-models-cost`: the built-in test model's calls share one line named
  "Built-in test model", never its model id ("echo"): "Built-in test model · 3 calls · 218 in ·
  41 out · no cost". Its cost part was "built-in test model, no cost"; it is now "no cost", as for
  any other call priced 0.
- `runs.run-view.receipt-approvals`: a wait step's answer is listed in Approvals with the tool
  approvals, in the order asked, named by the step's title: "Approve this reply?: approved by you
  at 16:54". It reads "waiting for your answer" while open and "not answered" once a timer moved
  it on or the run ended.
- `runs.run-view.live-or-saved`: the run page's Ran on row is left out when the workspace has no
  version history. A workspace that has history keeps "Version not recorded." for a run that
  recorded no version.

## Why

These are D4 and D5 of HAL-12721, the designer's words for small fixes on approved screens,
confirmed by Liam there (a team decision under HAL-2282). "echo" means nothing to a new user, the
flow shows the wait step's answer in Approvals, and a sample with no history said "Version not
recorded." on every run, which reads like an error. Nothing is removed for a workspace that has
history, and the code is in the same pull request.

## Covers

- runs.run-view.receipt-models-cost
- runs.run-view.receipt-approvals
- runs.run-view.live-or-saved
