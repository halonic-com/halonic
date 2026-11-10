# kit.header-badge

- Status: active
- Since: 0.1.0
- Source: HAL-3521; base component specs 20.1 (revision 17, phone revision 27), 10, 14, 15.3 and 23.5; visual review kit T1-F50, T1-F52, T1-F54 and T1-F55

The kit's `HeaderBadge` shall be a real `<button type="button">` drawn as the neutral Status chip: 24px high, radius 4px, a `surface-muted` fill, `text-caption` at weight 500 in `fg-muted`, a 14px leading icon hidden from screen readers and a 6px gap. It shall always be neutral, never `warning`. A hover shall step the fill up to `border` and the text to `fg`, and keyboard focus shall show the standard focus ring. Its edge shall be see-through, so high contrast draws it, and `border-control` when more contrast is asked for.

With `as="menu"` (the sample chip) it shall show the info icon, its words and a trailing 14px chevron, with padding 0 6px 0 8px, and on desktop open a kit Menu with its `description` and `entries`, lined up with its right edge, 4px below; it shall carry `aria-haspopup="menu"` and `aria-expanded`, and while its Menu is open show a 2px `accent` ring that isn't the focus ring. With `as="button"` (the trust badge) it shall show the dashed-ring icon and its words, a middle dot and its `action`, with only the `action` in `accent-text`, padding 0 8px, no chevron and no `aria-haspopup`; a click shall call its `onClick`; its name shall be its words and its action with a full stop between them ("Not trusted yet. Review"), unless the feature gives a `label`.

On a phone the badge shall sit on its own 48px line with a 1px `border` under it, have a 48px hit area, and wrap at large text instead of being cut. There the sample chip shall call `onOpenSheet` instead of opening a Menu, and shall carry no `aria-haspopup`.

## Examples

- Given the sample chip "Sample · test model" with the description "Runs on the built-in test model, with scripted replies. No key, no cost." and the items Use a real model…, About the sample and Remove the sample,
  when the user clicks it on desktop,
  then its Menu opens with the description first, and the badge has `aria-expanded="true"`.
- Given the trust badge "Not trusted yet" with the action "Review",
  when it renders,
  then it reads "Not trusted yet · Review" with only Review in `accent-text`, it's named "Not trusted yet. Review", and it has no `aria-haspopup`.
- Given that trust badge,
  when the user clicks it,
  then its `onClick` is called once.
- Given the trust badge on a phone with the label "Not trusted yet. Open trust settings",
  when it renders,
  then it's on its own 48px line and named "Not trusted yet. Open trust settings".
- Given the sample chip on a phone,
  when the user taps it,
  then `onOpenSheet` is called and no Menu is rendered.
