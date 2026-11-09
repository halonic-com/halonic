# kit.callout

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 17, 23 A10 and 23.5

The kit's `Callout` shall draw a box with an 8px radius, no visible border and no shadow, padded 12px and as wide as its column, filled `accent-soft`, `warning-soft` or `danger-soft` for its `info`, `warning` or `danger` tone, with a transparent 1px border so its shape stays visible in forced colours. It shall show a 16px icon in the tone's colour, the tone's own (info circle, triangle, alert circle) unless an `icon` is given, hidden from screen readers and 2px down so it is centred on the first line, then 8px, then a content column that can shrink. The content shall be an optional `title` in `text-body-strong` and the text in `text-small`, both in `fg`, wrapping between words and never cut. When it has `files`, it shall list them under the text in a `<ul>` with no bullets, in mono, wrapping anywhere, showing three and then "and N more". When it has an `action`, it shall render it under the text as a ghost `sm` button whose label lines up with the text, busy while a promise the action returns is pending. It shall have no close button. Without `announce`, it shall have no role and no `tabindex`. With `announce="focus"`, it shall be a `role="group"` with `tabindex="-1"`, named by its title (by its text when it has no title) and described by its text and list, with the focus ring, never `role="alert"`, and it shall expose a `focus()` that does not scroll.

## Examples

- Given a `warning` Callout with the title "Couldn't change 3 files" and five `files`,
  when it renders,
  then it lists three files and "and 2 more".
- Given a Callout with `announce="focus"` and a title,
  when the screen calls its `focus()`,
  then focus is on the Callout, which is read as "Couldn't change 3 files", a group.
