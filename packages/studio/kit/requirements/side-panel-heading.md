# kit.side-panel-heading

- Status: active
- Since: unreleased
- Source: HAL-16801 (T14 PR 10); flow-assistant 2.2 and 5.5 (HAL-647)

The Side panel, when given a heading, shall show it in the title's place, and shall keep the title as a heading that only screen readers read, so a menu that opens from the heading isn't read as part of the title.

## Examples

- Given a Side panel titled "Add a routine" with a button as its heading, when it shows,
  then the button is in the header and the `h2` "Add a routine" is visually hidden.
