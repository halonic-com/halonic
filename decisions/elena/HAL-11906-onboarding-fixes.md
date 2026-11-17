# Decision: the onboarding card grows with its content, up to 85% of the window

- Approval: decided by the team in the design check of HAL-5405 (HAL-11903, section 4); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-11906

## What changes

`settings.sandbox-choice-flow`: the onboarding card was capped at about 60% of the window high, which cut off the recommended card at 1280x800 and 720x560. It now grows with its content up to 85% of the window high (90% when the window is 560 px high or less), and scrolls beyond that with a fade at the cut while there is more below. The action row stays whole beneath the body. The card's text and padding are slightly tighter in windows 560 px high or less.

`settings.sandbox-choice-flow` and `settings.sandbox-choice-view`: an example now says "virtualisation", and the confirmation's sentence that Halonic still asks before an agent runs a command shows only when the host says it really does (a `promise` prop, as on the last screen). Nothing else about what the screens report changes.

## Why

A new person could not tell the recommended card had more lines, and the Windows caveat was never seen on the native card. The design check also found "virtualization" spelled two ways, and a promise on the confirmation that is not yet confirmed true (O4).

## Decided by the team

- 85% is the new cap; the old 60% line in the requirement is replaced.
- The Windows caveat is stored with a lower-case first letter, so "Good to know: network limits are weaker on Windows." reads right; the card capitalises it where it stands alone.

## Covers

- settings.sandbox-choice-flow
- settings.sandbox-choice-view
