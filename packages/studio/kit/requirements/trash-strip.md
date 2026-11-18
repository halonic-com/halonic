# kit.trash-strip

- Status: active
- Since: unreleased
- Source: HAL-12278; microcopy 2 ("Open tab whose item was deleted")

The kit's `TrashStrip` shall be the strip an open item page shows once its item is in the trash: a `warning` Callout, 16px in from the page's sides and 8px above what follows, holding the strip's text, then its optional second line on a line of its own, and one Undo action. With `focusUndo`, Undo shall take focus when the strip appears and be described by the strip's text and second line, so they are heard once; without it, the strip shall take no focus. Undo shall be busy while a promise it returns is pending.

## Examples

- Given a strip with the text "This skill was moved to the trash." and the second line "1 agent now shows an error until you take it off its Tools page." and `focusUndo`,
  when it appears,
  then focus is on Undo, which is described by "This skill was moved to the trash. 1 agent now shows an error until you take it off its Tools page.".
- Given a strip with the text "This file was moved to the trash" and no `focusUndo`,
  when it appears,
  then focus stays where it was.
