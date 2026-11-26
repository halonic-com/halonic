# Decision: changesets write placeholders as {name}, not a bare <name>

- Task: HAL-19604
- Approval: Liam decided this on HAL-19603 (option 1: fix it in the changeset text, not by escaping in `tooling/publish/`); he reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:g4rfN5w1qEkZfXmy62GIy3Qshvxa2HSvJw0JU7AE0kw+8X9UMWrJiCL5MkgEL6kTa3kvX75Ro2N5gyGqXFj2BQ==

## What changes

- `tooling/check/src/rules/changesets.ts`: the `changesets` rule also fails a changeset whose text has `<` followed by a letter outside an inline code span, a fenced code block or an autolink. The error names the file and line and says to write placeholders as `{name}` or put the command in backticks. Requirement `check.changesets-no-bare-placeholders`.
- Three waiting changesets (`ask-about-placeholder`, `ask-about-skill-and-describe-workflow`, `workflow-page-chat-about`) now write their placeholders as `{skill name}` and `{name}`. No other word changed.
- `messenger-typing-offline` is left to HAL-19563 (#6495); the released part of `apps/studio/CHANGELOG.md` is left alone, since the release notes read only the current version's section.

## Why

Since #6492 the release notes copy the version's section of the changelog unescaped into the GitHub release and `latest.json`. GitHub's Markdown drops a bare `<Agent>` as an HTML tag, so `"<Agent> is typing…"` reads `" is typing…"`. Fixing the source keeps the release page and the update dialog the same text, and `{name}` is how the requirements already write placeholders.

## Tests

No test was skipped or weakened. `changesets.test.ts` adds tests for a bare placeholder (one and two words), backticks, `{name}`, autolinks, a fenced block and the message; the tests for the other two changeset requirements are unchanged.

## Covers

- tooling/check/
- check.changesets-no-bare-placeholders
