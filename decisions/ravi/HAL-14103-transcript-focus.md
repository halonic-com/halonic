# Decision: the chat transcript is one Tab stop, and its scroll clears the notice

- Task: HAL-14103
- Approval: a kit detail of the approved chat parts (HAL-13177), decided by the team on HAL-14103 (HAL-2282)
- Kind: user-visible

The requirement widens two promises and narrows none. A transcript whose messages held no button
couldn't be reached with the keyboard in WebKit (the desktop app on macOS and Linux), because
WebKit, unlike Chromium, doesn't make a scrolling region focusable by itself, so a keyboard user
couldn't scroll back to earlier replies (WCAG 2.1.1). The transcript is now one Tab stop with the
kit's focus ring in every engine. It stays a region named by its `label` and stays out of live
regions. With a `notice`, its scroll is padded at the top by the notice's height, re-measured when
the notice wraps, so a control scrolled into view as it takes focus isn't hidden under the sticky
notice (WCAG 2.4.11). No new words. No test was weakened: the existing tests are unchanged, and two
new tests check that the section has `tabindex="0"` and that the scroll padding follows the
notice's height. A keyboard check of the change on its head (C317, HAL-14114) confirmed both.

## Covers

- kit.chat-transcript
