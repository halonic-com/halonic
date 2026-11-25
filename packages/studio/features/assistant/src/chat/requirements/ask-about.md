# assistant.chat.ask-about

- Status: active
- Since: unreleased
- Source: HAL-18055 (T14 PR 17d1); HAL-18154 (17d2); HAL-18155; HAL-18151; flow-assistant 2.1 and 10 (HAL-647)

When another feature asks the Assistant about an item, such as a page's "Ask about this skill…", the Studio shall show a new Build chat about that item in the Assistant panel, reusing an empty Build draft about the same item, shall open the panel if it is closed, and shall put focus in the box, and shall show the item under "Shown:" by its name. The chat shall keep the item it is about.

When a feature asks for the chat on the left of an item's page, the Studio shall show the item's most recently used Build chat, else a new Build chat about the item, and the Assistant panel shall not show that chat while the page holds it.

## Examples

- Given the panel is closed, when the library feature asks about skill "summarize" in hub "acme",
  then the panel opens on a new Build chat about that skill, with focus in the box and the skill under "Shown:".
- Given a kept chat about workflow "triage", when the workflow page asks for its chat,
  then the page shows that chat.
