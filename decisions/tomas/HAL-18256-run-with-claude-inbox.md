# Decision: show Settings › Your server now that the Inbox offers "Run with Claude"

- Task: HAL-18256
- Approval: Liam approved the plan on HAL-20454 (https://paperclip.halonic.com/HAL/issues/HAL-20454), which drops `server-session` from the unfinished sections and fixes its test, for HAL-18256. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

Settings › Your server was hidden with the unfinished sections until the Inbox offered "Run with
Claude" (HAL-17844). This pull request adds that offer, so the section now shows. The requirement
`settings.server-session` said the section "shall stay hidden with the unfinished sections until
the Inbox offers "Run with Claude""; its last sentence now says the section shows. The test "stays
hidden with the unfinished sections" becomes "shows now that the Inbox offers Run with Claude,
unfinished sections hidden or not": it checks the section is listed with the unfinished sections
hidden as well as shown, so it checks as much as before. No test was weakened or skipped.

## Why

The condition the requirement waited for is met in this pull request, so keeping the section
hidden would leave **Set up your server in Settings first** opening a Settings without Your server.

## Covers

- settings.server-session
- packages/studio/features/settings/src/server-session/server-session-section.test.tsx
