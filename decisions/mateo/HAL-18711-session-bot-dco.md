# Decision: the standing DCO statement covers halonic-session-bot[bot]

- Task: HAL-18711
- Approval: the board approved adding the session bot to the standing statement on HAL-18714 (option A); Liam reviews the code on HAL-18711 and signs this note as the CTO
- Kind: internal

## What changes

The `dco` check gets a second covered account, `halonic-session-bot[bot]` (GitHub id
`361236096`). Its unsigned commits pass only when the author address is
`361236096+halonic-session-bot[bot]@users.noreply.github.com` and the bot opened the pull
request, as for `halonic-dev`. The name alone never counts. Each covered account now records its
GitHub id, and a test requires every covered address to be `<id>+<login>@users.noreply.github.com`.
`docs/legal/dco-standing-statement.md` gets the matching row and says "accounts"; that is the
whole wording change the board approved. `check.dco-sign-off` gains two examples and its source
line names HAL-18711; nothing already in the requirement changes.

## Why

Server sessions write to GitHub as the session bot (HAL-18707). Without this, every pull request
the bot opens fails `dco`, because its commits have no `Signed-off-by` line.

## Tests

No test was weakened or skipped. Four were added: the bot's unsigned commit in its own pull
request passes, the same name with another address fails, the bot's commit in a pull request
another account opened fails, and every covered address is built from its account's id and login.

## Covers

- check.dco-sign-off
- tooling/check/
