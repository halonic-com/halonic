# Decision: the sandbox remove dialog drops Cancel and asks for a choice first

- Task: HAL-11388
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11388 (wording from microcopy 13.1a and design check HAL-11370 item X1; small wording and detail of an approved screen is a team decision, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:60EDQqfQcmNKa2h+wPSKzGt+WhWf5Qq2sjXjrX/BVo7jinRgfjyXf/McuJKG9PAjAvcspHSrvANkFoRMzki9Dw==

## What changes

The Remove sandbox setup dialog no longer has a third Cancel choice. Remove sandbox stays unavailable
until the user picks what happens to the contents, and the reason is shown under the choices.

The requirement `settings.wsl-remove-dialog` changes: two choices instead of three, and an unavailable
confirm button with its reason. `inbox.sandbox-row` gains one sentence about the footer.

Tests: the test that checked the Cancel choice is replaced by one for the new behaviour. In
`sandbox-setup-view.test.tsx` the "no way to run anyway" assertion no longer looks for `without the
sandbox`, because the footer (mc 23.3) now names that setting. No other test was weakened or skipped.

## Why

A Cancel radio made the dialog's confirm button do nothing when picked. The dialog already has a
close control, so the choice list only holds real outcomes.

## Covers

- settings.wsl-remove-dialog
- inbox.sandbox-row
