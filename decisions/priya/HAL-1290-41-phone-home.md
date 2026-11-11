# Decision: Home says why its sections failed, once

- Approval: the maintainer approves this change in review of HAL-1290 (15b, phone Home)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:iHV6pk24sh9uQfz6jmuZEiIMujhAYBYSq4Ul2yp4Edu7GnqbjAeUBsb1TwBbubtMdD3mTt0OwdGDV893i81wCA==

The requirement gains a promise and narrows one: "Loading Home" is no longer said while a
section shows its error with a reason. No test was weakened.

A section's start-aligned error isn't a live region, so when Home's sections failed, screen
readers heard nothing until the user reached them. UX checklist 1.15 and a11y 1.5 ask for the
failure to be said once, not once per section: when the engine isn't answering, every section
fails for the same reason. Home's one status, which already says "Loading Home", now says each
reason its sections failed for, once. The same holds on the desktop, so both layouts behave alike.

The page has one status, so when one section has failed and another is still loading, it says
one or the other. It says the reason: it tells the user something went wrong and why, while the
skeleton still shows that the other section is loading. Before, the requirement promised
"Loading Home" while any skeleton showed; it now says the reasons win. An error without a
reason (a kinded error with an empty message) says nothing, so it doesn't hide "Loading Home".

Three examples are added.

## Covers

- shell.home-states
