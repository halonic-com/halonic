# Decision: Get updates says plainly that Halonic can't combine both sides' new versions yet, without Try again

- Task: HAL-12370
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12363 (Sofia's UX check, row L13: small wording on the approved Changes screen, a team decision under HAL-2282; same words as microcopy revision 109 on HAL-751)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:aYuqajM4gIJr9xelaL1Isx7HWzACUA/NnX3rVwD4aYtPQBrJn+JFOalb4wKzRzuqUZc/yODnE3qptSYmDkNpAg==

## What changes

When the shared copy and this workspace both have new versions, the Get updates toast keeps its
title "Couldn't get versions" and now says "The shared copy and this workspace both have new
versions, and Halonic can't combine them yet. Nothing changed here." It no longer offers
**Try again**, since trying again gives the same answer until Halonic can combine versions.
The requirement `source-control.get-updates` gets the new words and drops Try again for this case.

## Why

A Try again that can't help is a dead button (UX check rule N5). The other Get updates errors
(shared copy can't be reached, and so on) keep Try again, because a retry can help there.

The test makes one expect call fewer: the two `toContain` checks on parts of the text became one
`toBe` on the whole sentence, and the Try again check became a check that there's no action.
No test was weakened or removed.

## Covers

- source-control.get-updates
