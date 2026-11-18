# agents.configuration.pages-phone

- Status: active
- Since: unreleased
- Source: HAL-12783, from the accessibility recheck on HAL-12774; flow-agents 5.1

While the Studio uses its phone layout, the agents feature shall show the Configuration's list of pages (Behaviour, Model, Harness) as a horizontal `TabList` across the top of the Configuration, in the same segmented look as the Runs and Configuration tabs above it, with the picked page below it at the full width; on the desktop the list shall stay a vertical column beside the page.

## Examples

- Given the phone layout and Configuration open with Behaviour selected and focused,
  when the user presses the right arrow key,
  then Model is selected and focused, and the Model page shows below the list, not beside it.
- Given the desktop layout,
  then the list is a vertical column beside the page and moves with the up and down arrow keys.
