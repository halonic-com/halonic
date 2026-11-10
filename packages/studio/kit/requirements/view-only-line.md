# kit.view-only-line

- Status: active
- Since: 0.1.0
- Source: HAL-3517; base component specs 15.6 (View-only line)

The kit's `ViewOnlyLine` shall show a 16px eye icon in `fg-muted`, hidden from screen readers, then the page's own sentence in `text-small` `fg-muted`, on the LineFrame. It shall show the sentence whole and let it wrap, never shorten it. It shall take no action, have no fill, and be neither a live region nor a callout, so that a screen reader reads it once, in order, as the first thing in the page's content.

## Examples

- Given a ViewOnlyLine "View only on a phone. Edit this workflow on a computer.",
  when it renders,
  then it shows the eye and that sentence in `fg-muted`, with no button or link.
- Given a ViewOnlyLine with a sentence longer than one line at 360px,
  when it renders,
  then the whole sentence is shown and wraps.
