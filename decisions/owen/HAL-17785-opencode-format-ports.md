# Decision: Dependabot never proposes an OpenCode update

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16826 (Liam approved the OpenCode harness plan on 23 Nov, with this ignore rule as one of its conditions; this pull request is HAL-17785)
- Kind: user-visible

OpenCode is approved as a harness program at one exact version only
(`docs/adr/2026-11-24-opencode-harness-program.md`). Every version bump is
its own security pull request, with the egress test, the config-key diff and
an eval smoke. An automatic update proposal would skip that checklist.

**What changes.** `.github/dependabot.yml` gains an npm entry with
`open-pull-requests-limit: 0`, so it opens no version-update pull requests at
all, and it ignores `@opencode/*`. The Docker entries are unchanged. Security
updates for other npm packages work as before.

## Covers

- .github/
