# kit.list-loading

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 19.3 and 6

While its `loading` prop is set, the kit's `List` shall show no rows and no `grid`, but a block with `aria-busy="true"` and, outside it, a visually hidden `role="status"` line and, when it has a `heading`, that heading visually hidden. A List with `loading` shall need a `loadingLabel`. A loading List with `empty` and no rows shall show the skeleton, not the Empty state. When it has been loading for 300ms, the List shall show three skeleton rows, hidden from screen readers, in the real rows' height (56px with a meta line, at least 64px on a phone) and lines, each with a `title` and a `meta` `SkeletonBar` at fixed widths that differ per row, a leading `icon` or `avatar` block when `skeleton.leading` is set and a `trailing` bar when `skeleton.trailing` is set; a 48px `heading` bar shall take the place of its `heading`, and the status line shall read the screen's `loadingLabel`. Before 300ms it shall show nothing. When it has been loading for 10 seconds, the List shall show "Still loading" under the rows, with a `secondary` Try again button (`sm`, `lg` on a phone) that calls `onRetry`, keep the skeleton rows, and say "Still loading" in the status line. When loading ends while focus is in the skeleton and it falls to `body`, the List shall move focus to the grid's Tab stop, or to the Empty state's title when it shows one.

## Examples

- Given `<List loading loadingLabel="Loading skills" heading={{ name: "Skills" }} rows={[]} />`,
  when 300ms have passed,
  then three `aria-hidden` skeleton rows and a heading bar show, and the status line reads "Loading skills".
- Given a loading List with `onRetry`,
  when 10 seconds have passed and the user clicks Try again,
  then `onRetry` is called and the skeleton rows stay.
- Given a loading List after 10 seconds with focus on Try again,
  when loading ends with rows,
  then focus is on the first row, not on `body`.
