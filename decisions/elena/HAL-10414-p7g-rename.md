# Decision: the collection page header name is a rename field

- Task: HAL-10414
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10750 (Liam's review of #3084; a team decision with no board card, HAL-2282 rule: rename is in the approved flow-library 5.3 header)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:tYn02X0Qk3a+sSlF3xRdh05niD/Dbh+5ronfDfhID6qwzHXe65DhfiUrbd9693R8HsSvviPCHNf3lswJu6/KCQ==

## What changes

The requirement `library.collection-page` gains one rule: the header shows the name as a rename
field. When a different name is kept, the page renames the collection through the host; if that
fails it says "Couldn't rename the collection." Two examples are added (a kept name renames
once, an unchanged name renames nothing).

Nothing existing is removed or weakened. No test is changed, skipped or deleted; tests for the
field, the unchanged name and the failure are added.

## Why

Rename is part of the approved page header (flow-library 5.3); the page showed the name as text.

## Covers

- library.collection-page
