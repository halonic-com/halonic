# kit.empty-state

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 11, 0.1, 0.2, 23 A2 and A10

The kit's `EmptyState` shall show a title, as a heading at level 2 unless `headingLevel` says otherwise, in `text-section`, with an optional description in `text-body` `fg-muted`, centred in the space it replaces within a 360px column with 6px between its parts, on the `bg-halo-wash` background. When it has an `icon`, the kit shall draw it at 20px in `accent` on a 40px `surface` tile with a 12px radius and `shadow-1`, hidden from screen readers. It shall show at most one primary button (`action`) and one secondary button (`secondaryAction`), `md`, which the Button draws at 40px on a phone. When it is `plain`, it shall draw no wash and no tile. When its `tone` is `error`, it shall draw the alert mark in `danger` in place of the icon (inline with the title when `plain`) and its button as secondary. When it is `align="start"`, which only an error may be, it shall be left-aligned inside a 16px inset with no tile and no wash: the 20px `danger` alert mark inline with a `text-body-strong` title, the reason in `text-small` `fg-muted`, and its button secondary and `lg`. Its title shall have `tabindex="-1"` and take a `titleRef`, so focus can move to it when what had focus goes away, and it shall draw no focus ring.

## Examples

- Given `<EmptyState icon={<AgentIcon />} title="No agents yet" action={{ label: "New agent", onClick }} />`,
  when the user clicks New agent,
  then `onClick` is called once.
- Given `<EmptyState tone="error" align="start" title="Couldn't load recent runs" action={retry} />`,
  when it renders,
  then the title has the alert mark before it and Try again is a secondary `lg` button under the text.
