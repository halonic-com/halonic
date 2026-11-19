# kit.empty-state

- Status: active
- Since: 0.1.0
- Source: HAL-1289, HAL-1290; base component specs 11, 0.1, 0.2, 17.1, 23 A2 and A10; microcopy 22 F1, F13 and F14; HAL-11642 (states audit gap 4) for the section error's link; HAL-12614 (a11y check H1) for the plain title

The kit's `EmptyState` shall show a title, as a heading at level 2 unless `headingLevel` says otherwise, in `text-section`, with an optional description in `text-body` `fg-muted`, centred in the space it replaces within a 360px column with 6px between its parts, on the `bg-halo-wash` background. When it has an `icon`, the kit shall draw it at 20px in `accent` on a 40px `surface` tile with a 12px radius and `shadow-1`, hidden from screen readers. It shall show at most one primary button (`action`) and one secondary button (`secondaryAction`), `md`, which the Button draws at 40px on a phone. When it is `plain`, it shall draw no wash and no tile, and its title shall be a paragraph rather than a heading, since it is one line under a heading that is already there. When its `tone` is `error`, it shall draw the alert mark in `danger` in place of the icon (inline with the title when `plain`) and its button as secondary; a centred error may also have a `link`, drawn after its button in `text-body` with the inline link style (`accent-text`, underlined on hover). When it is `align="start"`, which only an error may be, it shall be left-aligned inside a 16px inset with no tile and no wash: the 20px `danger` alert mark inline with a `text-body-strong` title, the reason in `text-small` `fg-muted`, and its button secondary and `lg`, followed by its `link` when it has one, as for a centred error. Its title shall have `tabindex="-1"` and take a `titleRef`, so focus can move to it when what had focus goes away, and it shall draw no focus ring.

## Examples

- Given `<EmptyState icon={<AgentIcon />} title="No agents yet" action={{ label: "New agent", onClick }} />`,
  when the user clicks New agent,
  then `onClick` is called once.
- Given `<EmptyState tone="error" align="start" title="Couldn't load recent runs" action={retry} />`,
  when it renders,
  then the title has the alert mark before it and Try again is a secondary `lg` button under the text.
- Given that section error with `link={{ label: "Copy details", onClick }}`,
  when the user clicks Copy details,
  then `onClick` is called once, and Copy details shows as an inline link after Try again.
- Given `<EmptyState tone="error" title="This page stopped working" action={reload} link={{ label: "Copy details", onClick }} />`,
  when the user clicks Copy details,
  then `onClick` is called once, and Copy details shows as an inline link after the Reload page button.
- Given `<EmptyState plain title="Nothing is waiting for you." />` under Home's Needs you heading,
  when a screen reader user moves by headings,
  then they hear Needs you and not the empty line, which reads as a paragraph.
