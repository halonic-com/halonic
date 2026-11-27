# Decision: the rail button's badge shows "99+" past 99

- Task: HAL-20675
- Approval: Liam signs this note for HAL-20675 (build plan P2 on HAL-20617, approved). A team decision from Julian's review of the rail button.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:03GHF045Hk/mh1dVcGmSZ2nKjvMUjLWjhS5WeU8fIzg0I/GCe7z5B1edXrr4U88ny5/tWuqe0lSXq55crPCDAw==

## What changes

`kit.rail-button` said the badge shows the count. Past 99 it now shows "99+", which the new
requirement `kit.rail-button-count-cap` records, so the badge sentence in `kit.rail-button` defers
to it: "it shall show the count ("99+" past 99, `kit.rail-button-count-cap`) in a 20px `accent`
badge". Nothing else in `kit.rail-button` changes. A screen reader still hears the whole count.

Two tests of the rail button change, both made stricter: the scale guard also catches named groups
and variants between the state and `scale-`, and the motion tests name the button's own group.

## Why

A two-digit badge is the widest the 40px rail button can carry without covering its drawing, and
the Messenger's rows already write "99+" past 99 (`messenger.chat-rows`), so one app's count reads
the same in the rail and in its list.

## Covers

- kit.rail-button
- packages/studio/kit/src/rail-button/rail-button.test.tsx
