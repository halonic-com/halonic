# kit.side-panel

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 12, 15.1, 15.3 and 23 A2

The kit's `SidePanel` shall be a `complementary` region named by its `label`, or by its title when it has none, that fills its container and never sets its own width. It shall have a `surface` fill and a 1px `border` on the side facing the main view (`facing`, `start` by default), with no radius and no shadow. Its header shall be 48px with a 1px divider below, the title as an `h2` in `text-section` on one line with an ellipsis, with `tabindex="-1"` and no ring, then the `actions` slot on the right. Its body shall scroll on its own with 12px 16px padding, wearing `bg-halo-wash` when `halo` is set. An optional `footer` shall be 48px (10px 16px padding) below a divider with its actions right-aligned. While `loading` is set, the body shall be `aria-busy` and show still skeleton lines in pairs, a title bar over a meta bar 8px apart, and a status line shall read the `loading` text. When it opens, focus shall move to `initialFocus` when that element is there, else to the title. When it closes with focus inside it, focus shall go back to the element that had it before, or, when that is gone or inert, to the page's `h1`. On a phone (presentation `phone`) it shall be a panel sheet: no side line, a header at least `--spacing-phone-bar` high with the top safe area, a 48px "Back" button at the top left that calls `onClose`, the title in `text-heading` on one line, the footer as a bottom bar with the bottom safe area, and `initialFocus` ignored.

## Examples

- Given a SidePanel "Sort the inbox",
  when it mounts,
  then focus is on its title and the region is named "Sort the inbox".
- Given a SidePanel on a phone with an `initialFocus`,
  when it mounts,
  then focus is on the title, and pressing Back calls `onClose`.
