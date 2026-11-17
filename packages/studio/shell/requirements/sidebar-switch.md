# shell.sidebar-switch

- Status: draft
- Since: unreleased
- Source: HAL-1293 (T5, Files tree); plan HAL-10534; flow-files 3.1; kit T5-F5, T5-F6

While a feature has added a sidebar view (`shell.sidebar-views`), the desktop sidebar shall show a switch under the Search box: a tab list named "Sidebar view" with "Studio" first, then one tab per view by the views' order, labelled with each view's `label`. "Studio" shall be selected at first and show the places as before. When another tab is picked, the sidebar shall draw that view, loaded when first shown, in place of the places, given the context of the feature that added it, and keep the Settings row under it. Picking "Studio" shall show the places again. While no feature has added a view, the sidebar shall show no switch and look as it did.

## Examples

- Given the feature `files` adds the view "Files",
  when the sidebar is drawn,
  then a switch reads "Studio" (selected) and "Files", and the places are shown.
- Given the switch, when "Files" is picked,
  then the Files view is drawn, the places are not, and the Settings row is still there.
- Given the Files view is shown, when "Studio" is picked,
  then the places are shown again.
- Given no feature adds a view,
  then there is no switch.
