# shell.phone-help

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5); first-run-progress 6, Sofia's UX check C509 ("put Help on the phone's More page")

On a phone, where the Help menu (`shell.help-menu`) has items, the More page shall list each Help group after its other lists as a list of its own, under the group's title, or "Help" for a group without one, and picking an item shall call its `run`. Where the Help menu has no items, the More page shall show no Help list.

## Examples

- Given the Help groups "Check this computer" (no title) and "First run" with **Show the guide** and **Start over**,
  when the user opens More on a phone,
  then it shows a list "Help" with **Check this computer**, then a list "First run" with the two items.
- Given that page,
  when the user picks **Start over**,
  then First Run's **Start over** runs.
- Given no Help group has items,
  when the user opens More,
  then there is no Help list.
