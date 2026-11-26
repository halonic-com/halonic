# Decision: Open demo names new folders "Acme demo"

- Approval: Nina's wording decision on HAL-19402 (from Sofia's walk-through, HAL-19383 G15), a team decision on approved screens; Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3pDkPgQU3SxGgiDfw3tyKLjntW09Jwt1aXXAEPLnVwyPbrHRg2YYJ00Xx89ZscyL9tUO8dQ9pqvxSDjFOemHAA==
- Task: HAL-19405

## What changes

`studio.try-sample`: **Open demo** now makes `Acme demo`, `Acme demo 2`, … in Documents instead of `Acme sample`, `Acme sample 2`, …, so the toast reads "Created Acme demo" and the refusal at 99 copies says "there are already 99 copies of the demo". The requirement's text and its two naming examples use the new name. A folder the device already remembers as the demo under the old name is still reopened, and no folder is ever made under the old name; a new example covers that.

## Why

The demo workspace is called the demo everywhere in Studio (the **Open demo** button, the Recent tag "Demo"). Existing folders keep their name, also Nina's decision, so nobody gets a second copy after updating.

## Covers

- studio.try-sample
