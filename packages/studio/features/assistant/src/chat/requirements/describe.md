# assistant.chat.describe

- Status: active
- Since: unreleased
- Source: HAL-18055 (T14 PR 17d1); decision HAL-1653; HAL-18151; flow-workflows 2.2 (HAL-329); flow-assistant 10 (HAL-647)

When another feature asks the Assistant to describe a new item with a text, such as the New workflow dialog's "Describe it to the Assistant instead ›", the Studio shall show a new Build chat about no item in the Assistant panel, reusing an empty Build draft about no item, shall open the panel if it is closed, shall put the text in the box without sending it, and shall put focus in the box with the caret at the end of the text.

## Examples

- Given the panel is closed, when the workflows feature asks to describe "Make a workflow called Invoice intake that ",
  then the panel opens on a new Build chat whose box holds "Make a workflow called Invoice intake that ", nothing is sent, and the caret is at the end.
- Given an empty Build draft about no item, when it is asked again,
  then that draft is shown rather than a second one.
