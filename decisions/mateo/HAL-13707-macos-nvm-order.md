# Decision: the manual macOS docs check follows the install page's nvm order

- Task: HAL-13707
- Approval: Liam approves this note in review of this PR
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hDwrceg+W2Kcyfx2yvyFKSkd5QhLM1mpbqXnlYHTr0XWtw1i4RUbNBoe8k58VdYDxlaGv/9147ZuebHM9oIGCA==

## What changes

In `.github/workflows/docs-install-check-macos.yml`, which runs only by hand (`workflow_dispatch`),
the nvm fallback of step 2 now runs the install page's steps in the page's order: `touch ~/.zshrc`
and nvm's curl line together, then a new terminal with `nvm install 26 && nvm alias default 26`.
It records a finding only when one of those steps fails, when nvm's installer still prints
`Profile not found`, or when `nvm install 26` fails with something other than "command not
found". It adds no new secret or write permission and does not touch any other workflow.

## Why

Since website #438 the install page gives nvm's curl line and says to run `touch ~/.zshrc` first
on a new Mac. The check still reported that the page gives no command, so every run would have
shown a gap that is already fixed, and it ran nvm's installer without `touch` first.

## Tests

No test was weakened or skipped. Tested with a run of the branch.

## Covers

- .github/
