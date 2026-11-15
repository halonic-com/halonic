# Decision: reach the listed-tools failure screens, show refused reasons in full

- Task: HAL-9855
- Approval: Liam approves this change on HAL-10010 (https://paperclip.halonic.com/HAL/issues/HAL-10010#comment-b42ab0af-c462-4b7f-983a-aa5295d44b54), for HAL-9855. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jeXsdrP/7un5kLCiLm96qnZvFf6iREFekVLMVb2lACXLdfIQefXikhsa6/b8WDhZTLKJBnOjukJX1iMtE8bgDw==

## What changes

The connector page's listed-tools line now shows a one-line notice when the tool list could not
be read (with **Try again**), was refused, or an approval is unreadable (with **Review tools**).
Before, the page said nothing and the matching screens could not be opened. A refused tool's
reason is shown in full and wraps, instead of being cut at 64 characters. Each "keeps changing"
line sits directly above its **Turn it on anyway** button.

The requirements `library.listed-tools-waiting` and `library.listed-tools-review` are updated to
say this. The test "cuts a refused reason between characters, not inside an emoji" is removed
because nothing cuts a reason any more; tests for the notices and the full reason are added.
No test was weakened or skipped.

## Why

Found in the design check on HAL-9835: with no waiting tools the page hid the only way to open the
failure screens, and a cut reason was readable only in a tooltip on an item that can't be focused.

## Covers

- library.listed-tools-waiting
- library.listed-tools-review
- packages/studio/features/library/src/ui/listed-tools-review-body.test.tsx
