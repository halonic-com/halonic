# kit.skeleton-bar

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 19.3

The kit's `SkeletonBar` shall draw a still `surface-muted` block, hidden from screen readers, in the shape of the part it stands in for: a 10px `title` bar, an 8px `meta` bar, a 10px by 80px `trailing` bar, an 8px by 48px `heading` bar, a 20px `icon` block or a 28px `avatar` block. A `title` or `meta` bar's width shall come from a fixed set of shares of the text column, never from chance. It shall have no shimmer and no pulse. It shall have a transparent 1px border, so the bar's shape stays visible in forced colours, which drop its fill.

## Examples

- Given `<SkeletonBar kind="title" width="2/5" />`,
  when it renders,
  then it is an `aria-hidden` block 10px high at 40% of its column.
