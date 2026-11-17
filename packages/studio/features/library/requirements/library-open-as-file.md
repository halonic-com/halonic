# library.library-open-as-file

- Status: active
- Since: unreleased
- Source: HAL-1303 (P9b, P9c); flow-library 4

When the user picks Open as file in a Library row's ⋮ menu or an open item page's ⋮ menu, the Library shall open the item's file in the code editor in a tab: a skill's `SKILL.md`, or the one file of a knowledge source, collection or connector. On a phone, which has no tabs, it shall show the file as read-only text in a panel sheet instead: the kit's side panel over the page, titled with the file's name, with Back and no other action, and long lines wrapped. A phone offers it in the page ⋮ of all four kinds and in the rows' ⋮ of skills and collections, the kinds whose phone rows have a ⋮. While the file reads, the sheet shows a loading state; when it can't be read, it says "Couldn't load this <kind>" with the reason ("This <kind> isn't in this workspace any more." when it is gone) and Try again. A file that isn't valid YAML still shows as text. The desktop entry is offered only where the app can open a tab.

## Examples

- Given the shared skill "Tone",
  when the user picks Open as file in its row's menu,
  then a tab opens on `library/skills/tone/SKILL.md`.
- Given the collection "Claims" is open on its page,
  when the user picks Open as file in the page's menu,
  then a tab opens on `library/collections/claims.collection.yaml`.
- Given a phone and the skill "Tone" is open on its page,
  when the user picks Open as file in the page's menu,
  then a sheet titled `SKILL.md` shows the file's text, and Back closes it.
- Given a phone and a file that can't be read,
  when the sheet opens,
  then it says "Couldn't load this skill" with the reason, and Try again reads the file again.
