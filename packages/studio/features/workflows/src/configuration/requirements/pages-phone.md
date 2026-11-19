# workflows.configuration.pages-phone

- Status: active
- Since: unreleased
- Source: HAL-13649, from the accessibility check on HAL-13638 (C206 P6b); the pattern of `agents.configuration.pages-phone`

While the Studio uses its phone layout, the workflows feature shall show the Configuration's list of pages (General, Request form, Tests, Problems) as a horizontal `TabList` across the top of the Configuration, with the picked page below it at the full width and each row's label above its value; the Problems count shall still show and be read as "Problems, 1 error"; while the settings load, the list's skeleton shall go across the top too; on the desktop the list shall stay a vertical column beside the page.

## Examples

- Given the phone layout and Configuration open with General selected and focused,
  when the user presses the right arrow key,
  then Request form is selected and focused, and the Request form page shows below the list at the full width.
- Given the desktop layout,
  then the list is a vertical column beside the page and moves with the up and down arrow keys.
