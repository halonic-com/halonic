# Decision: Home says why its sections failed, once

- Approval: the maintainer approves this change in review of HAL-1290 (15b, phone Home)
- Kind: internal

The requirement gains a promise; nothing it promised before is taken away, and no test was
weakened.

A section's start-aligned error isn't a live region, so when Home's sections failed, screen
readers heard nothing until the user reached them. UX checklist 1.15 and a11y 1.5 ask for the
failure to be said once, not once per section: when the engine isn't answering, every section
fails for the same reason. Home's one status, which already says "Loading Home", now says each
reason its sections failed for, once. The same holds on the desktop, so both layouts behave alike.

One example is added.

## Covers

- shell.home-states
