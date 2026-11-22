# Decision: a cancelled plugin sign-in says so in the browser

- Approval: HAL-15419 (split out of HAL-15398, Iris's flow check C570, item 5, part 4); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:A/1B3z2GQCzp4fYUkae48aZ3vD2zhf34x0ZVt/h2mIz3Y7QQ2PbEknFgmEOOdmGKKqPwoyzuYVl9bF0rgINdAQ==

## What changes

When the person presses Cancel on a plugin's sign-in, the flow still drops the pending sign-in at
once, but it now keeps the cancelled sign-in's callback path for the rest of its 10-minute wait.
A person who then finishes in the browser gets a short page, "This sign-in was cancelled in
Halonic. Start it again there to sign in.", instead of the bare "This sign-in link is no longer
valid." Nothing is exchanged and nothing is saved, as before. Cancel also records the outcome
`cancelled`, so the sign-in's status says how it ended, as it already did for a refusal at the
provider. Cancel with no pending sign-in records nothing.

`integration-sign-in.sign-in-flow` says this in its text and gains three examples. Its
`handlesPath` example changes: a cancelled sign-in's path is still handled until its wait is
over, so the host routes it to its flow. `integration-sign-in.sign-in-host` and
`agent-host.integration-sign-in-routes` each name the cancelled page and the `cancelled`
outcome in the example about Cancel. No other example was removed or weakened.

## Why

A person who cancelled in Halonic and then went on in the browser got a page that told them
nothing about why it didn't work. The page now names the one thing they did and where to start
again. It is only given at the path of the sign-in that was cancelled, a random path that the
person's own browser was sent to, and it still says nothing about other paths, so a path no
sign-in waited on keeps the plain 400. A sign-in started again replaces the cancelled one, and its
old path then gets the plain 400, as a replaced pending sign-in's does.

## Covers

- integration-sign-in.sign-in-flow
- integration-sign-in.sign-in-host
- agent-host.integration-sign-in-routes
