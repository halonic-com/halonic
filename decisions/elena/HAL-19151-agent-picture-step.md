# Decision: the click test's step 9 checks the agent's picture, and the kit Avatar says when it drew one

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19151 (step 3 of HAL-19133, the board's report that agent pictures don't show in the installed preview)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:p2ifZuPOPx4HsusxPpdsVv7nXN0478uCu6hFQdamRkrOX3hGVu626HZc6gdL7WCBDnZTsxiui+/5XsEOOXf8Cw==

Step 9 (`studio-click-test.paperclip-steps`) also checks that the seeded agent's chat row and the open
chat's header show its picture, not its initials, and fails as `NO_AGENT_PICTURE` when they don't. The
pinned Paperclip gives every agent a `cap-v1` picture by default, so the seed is unchanged. The message
check runs first, so a missing picture never hides whether sending works.

The picture is a canvas, whose pixels WebDriver can't read, so `kit.avatar-picture` adds one sentence:
once drawn, the tile carries `data-picture="drawn"`. Nothing a user sees changes. No requirement was
retired and no test was weakened.

## Covers

- studio-click-test.paperclip-steps
- kit.avatar-picture
