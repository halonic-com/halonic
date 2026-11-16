# library.library-open-as-file

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (P9b); flow-library 4

When the user picks Open as file in a Library row's ⋮ menu or an open item page's ⋮ menu, the Library shall open the item's file in the code editor in a tab: a skill's `SKILL.md`, or the one file of a knowledge source, collection or connector. The entry is offered only in the desktop window, where the app can open a tab. The phone has no tabs, so it shows no Open as file.

## Examples

- Given the shared skill "Tone",
  when the user picks Open as file in its row's menu,
  then a tab opens on `library/skills/tone/SKILL.md`.
- Given the collection "Claims" is open on its page,
  when the user picks Open as file in the page's menu,
  then a tab opens on `library/collections/claims.collection.yaml`.
