# kit.tabs

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 5, 0.2, 23 A10 and 23.5

The kit's `Tabs` shall render a page's views as a named `tablist` of `tab` buttons on a segmented `surface-muted` track, with the selected tab on a `surface` fill with `shadow-1` and, in high contrast only, a 1px `CanvasText` outline, and one `tabpanel` holding the selected view, labelled by the selected tab. Only the selected tab shall be in the Tab order. When the user clicks a tab, or presses the left or right arrow key, Home or End in the tab list, the kit shall move focus to that tab and select it, wrapping round at the ends and skipping disabled tabs; a disabled tab shall be drawn in `fg-disabled`, and in `GrayText` in high contrast, ignore clicks and stay out of the arrow keys' way. A tab's counter shall be a round chip, `accent` or `danger`, hidden from screen readers, which hear its name after the tab's name instead ("Configuration, 2 errors"); the tab itself shall never turn red. When the presentation is `phone`, or `fill` is set, the tabs shall share the full width in equal parts, each at least 48px high, with labels that wrap and hyphenate instead of being cut. Otherwise the labels shall sit on one line, and wrap inside their tabs when the tabs are wider than their column. When `sticky` is set, the tab list shall stay at the top of the scroll area on a `surface` fill.

## Examples

- Given tabs Flow, Configuration and Runs with Flow selected and focused,
  when the user presses the right arrow key,
  then Configuration is selected and focused, and the panel shows its view.
- Given a Configuration tab with `count={{ value: 2, tone: "danger", name: "2 errors" }}`,
  when it renders,
  then it shows a red "2" chip, and screen readers hear "Configuration, 2 errors".
- Given the tabs inside `<PresentationProvider presentation="phone">`,
  when they render,
  then each tab is at least 48px high and they share the track equally.
