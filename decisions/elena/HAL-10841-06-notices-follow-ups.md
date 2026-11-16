# Decision: the Notices section follow-ups

- Task: HAL-10841
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10850 (Liam's review of #3116; a team decision with no board card, HAL-2282 rule: it builds on the approved flow-inbox 3.2 Notices section)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XJTgo0lMoD8TdlVq5U/tyOZI0zOQ326BFEo0iJJ1tpE7P1u95JqbCm88odOQ8108r/xsGAmMZ5FMBREHVEJpBg==

## What changes

The requirement `inbox.notices-section` gains four rules, all about what a screen reader and
keyboard user meets: each **Open run** is described by its row's title; removing the last notice
moves focus to the Needs you heading; the Notices are hidden while Needs you failed to load; and
notices read from another source never show, not even under "Showing the last…". Three examples
are added or sharpened to match.

Nothing existing is removed or weakened. No test is changed, skipped or deleted; tests for each
new rule are added.

## Why

Review of #3114 found that the buttons were indistinguishable by name, that focus was lost
after the last ×, and that notices could outlive the source they came from.

## Covers

- inbox.notices-section
