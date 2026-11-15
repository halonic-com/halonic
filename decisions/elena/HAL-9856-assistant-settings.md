# Decision: the Assistant key line names the secret, and its links say Models

- Task: HAL-9856 (Settings › Assistant design check, from HAL-9835)
- Approval: Sofia's design check on HAL-9835 and her check of #2841 on HAL-9856 ask for this wording; Liam approves and signs this note in review
- Kind: internal

## What changes

`settings.ai-agent-key-line` changes its wording only. When no provider uses the secret the line
names it in code font ("Add a provider that uses `anthropic-api-key` to Acme ›"). The two links say
"in Models ›" because they open the Models page, not a provider page. The ● and ○ dots are hidden
from screen readers. No example was removed or weakened.

## Why

The line promised a provider page that doesn't exist yet, and the dots were read aloud. Hiding the
links (#2719) would leave a person with no key and no way to add one, so the links stay and say
where they go. The wording goes back to "provider page ›" when provider pages exist.

## Covers

- settings.ai-agent-key-line
- packages/studio/features/settings/src/assistant/assistant-section.test.tsx
