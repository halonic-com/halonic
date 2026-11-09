# kit.window

- Status: active
- Since: 0.1.0
- Source: HAL-1687 (theme proposal, "What carries over to the Studio"), HAL-1900

The kit's `WindowBar` shall draw the thin header bar of a file view: at least 36px high, on the `surface-subtle` fill with a 1px `border` line below, holding its `title` (the file name or the run) in `text-caption` mono `fg-muted`, which wraps rather than being cut off, and its `actions`, if any, on the right. It shall draw no window dots. The kit's `Window` shall draw a bordered `surface` box with a 12px radius, a `WindowBar` on top and its content below with no padding of its own, and shall render as a `<section>` named by its title; with an empty title it shall be unnamed. The `Window` shall clip its content to its rounded corners but shall not clip its bar, so the focus ring of an action in the bar is never cut off.

## Examples

- Given `<Window title="workflows/review.yaml">…</Window>`,
  when it renders,
  then it is a `<section>` whose name is "workflows/review.yaml", with the bar as its first child.
- Given `<WindowBar title="review · run 12" actions={<button>Copy</button>} />`,
  when it renders,
  then "Copy" sits in a group pushed to the right of the bar.
- Given `<Window title="review.yaml" actions={<button>Copy</button>}>…</Window>`,
  when "Copy" has focus in high-contrast mode,
  then its 5px focus ring shows in full above the button: only the content below the bar is clipped.
