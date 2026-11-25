# assistant.chat.ask-about-placeholder

- Status: active
- Since: unreleased
- Source: HAL-18177; HAL-18155 (point 4); flow-assistant 1 (HAL-647)

When another feature asks the Assistant about an item, such as a page's "Ask about this skill…", the box of the Build chat it shows shall have the item-page chat's placeholder "What should change in <name>?", with the item's name. A Build chat about no item shall keep the box's own placeholder.

## Examples

- Given the library feature asks about skill "Summarize",
  then the box's placeholder is "What should change in Summarize?".
- Given the New workflow dialog's Describe link opens a chat about no item,
  then the box's placeholder is "Ask for a change…".
