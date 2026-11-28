# Decision: the rail may open a page a feature adds as an item kind, so Code opens Code's page

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20990 (Code in the new design, P5 of the HAL-20617 build plan; the board picked "Code like chats" on HAL-20742, 28 Nov 2026). Liam approves the change in review on HAL-20990.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4xAYn89UoJnnd4wE/sr7zb9By99izK3EDnLMEafMdk7XNVKQ+uJl3Ipe1JhOL7vnj25zUq7XPqNyo1kYLRbeDQ==

## What changes

`studio.desktop-rail-selection` said the rail opens only pages that a desktop feature or the shell adds as a place. It now also allows a page that a desktop feature adds as an item kind, as Files adds Code's page (`code/workspace/files`, requirement `files.code-page`). It also says Code holds Code's page as well as a file, and gains an example for it.

The test that checked every `opens` key against the places now checks a place's key against the places and an item's key (`kind/hub/id`) against the item kinds. A key nothing draws still fails, so the test is no weaker for the keys it checked before. A new test checks that the Code entry opens Code's page, and the items table gains `code/workspace/files` in Code. No test was skipped or removed.

## Why

Code's page has no place. A new place would mean adding `code` to the shell's fixed place list and its names (`sidebarPlaces`, `placeNames`), which also puts a Code row in the sidebar and changes the shell's public interface. An item kind is something a feature already adds on its own, so the page stays inside the files package. What the rule guards against, a rail entry that opens a page nothing draws, holds either way.

## Covers

- studio.desktop-rail-selection
