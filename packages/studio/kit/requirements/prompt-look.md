# kit.prompt-look

- Status: active
- Since: unreleased
- Source: HAL-19142 (design), board approval on HAL-19132, HAL-19756

Where a box is one the person types into to start something with an agent (the kit's `ChatComposer`, an `Input` with `look="prompt"`, and the `PaletteBox`), the kit shall draw it with 24px corners and the prompt edge (`#DCDFE5` in light, `#353C4C` in dark). The `ChatComposer` and a prompt `Input` shall also have the prompt surface (white in light, 6% white over the panel in dark) and the prompt shadow (`0 4px 18px -2px`), and when their text has focus and they have no error, the edge shall turn `accent` and the shadow deepen, without the field's 3px ring. The `ChatComposer`'s Send shall be a round 36px arrow inside the box at its right, in the grey `soft` fill while the message is blank and the `primary` fill once it isn't, and Stop shall take its place while `answering`; a `leading` button shall sit inside the box at its left. An `Input` or `TextArea` without `look="prompt"` shall keep the field look.

## Examples

- Given a ChatComposer holding nothing,
  when it's drawn,
  then Send is a round grey arrow inside the box.
- Given the same ChatComposer,
  when the person types "Ship it",
  then Send turns blue.
- Given an Input in a Settings form, without `look`,
  when it's drawn,
  then it has the field's clear edge and 8px corners, as before.
