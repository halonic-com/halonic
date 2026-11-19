# Decision: a routine whose target's file is gone says "was deleted", and the trust badge is described by its tooltip

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13018 (Sofia's C113 check on HAL-13003; words decided by the team under HAL-2282, building on the signed HAL-12646 note)
- Kind: user-visible

Same reason as HAL-12646: there is no trash. The scheduler's `in-trash` means the target is in the live
version but its saved file is gone, which on the desktop means it was deleted, and nothing can be put
back from a trash. So Run now says "Not started: *target* was deleted.", the Starts card says "*Name* was
deleted, so this routine won't start it.", the runs list says "*when*: *target* was deleted", and a host
without Accept says "…so no file was deleted." The internal names (`in-trash`, `target-in-trash`) stay.

The trust badge's tooltip showed on hover and focus but a screen reader never heard it (a11y row T2b,
WCAG 1.3.1). The kit's button `HeaderBadge` now takes the `aria-describedby` a feature gives, and the
shell passes the tooltip's on, so the badge reads its name and then what trust gates. Both requirements
gain the sentence and an example; nothing they said before changes.

No test was weakened: the same assertions check the new words, and new tests cover the description.

## Covers

- routines.page.run-now
- routines.starts.starts-card
- routines.runs.view
- kit.header-badge
- shell.header-badges
