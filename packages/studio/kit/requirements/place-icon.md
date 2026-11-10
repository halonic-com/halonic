# kit.place-icon

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.4 (HAL-175); visual review kit T2-F51 (HAL-3164)

The kit's `PlaceIcon` shall draw each of the sidebar's places, Home, Inbox, Agents, Workflows, Routines, Library, Runs and Changes, on a 24 grid with a 1.5px line at 20px, named by the place's key. It shall draw the outline by default and the filled icon when `filled` is set, for the place where you are. A filled icon shall keep the outline's silhouette and knock its inner details out rather than draw them in another colour, so it reads on the halo tint and in forced colours. The icon shall draw in the text colour and be hidden from screen readers, because the place's name says the same. Two filled icons on one page shall not share a mask.

## Examples

- Given `<PlaceIcon name="inbox" />`,
  when it renders,
  then it is an `aria-hidden` outline in `currentColor` with a 1.8 line on its 24 grid.
- Given `<PlaceIcon name="inbox" filled />`,
  when it renders,
  then the tray is knocked out of the filled shape by a mask.
- Given two filled Runs icons on one page,
  when they render,
  then each uses its own mask.
