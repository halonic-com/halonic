# kit.colour-popover

- Status: active
- Since: 0.1.0
- Source: HAL-3520; base component specs 3 (the leading button, revision 14) and 23.3 L10; decisions P-D1 to P-D5 on HAL-3520; visual review kit T1-F47, F48 and F49

The kit's `ColourPopover` shall be a popover with `role="dialog"`, named by its `label`, shown while `open`, 4px below the box its opener sits in with its left edge on the box's, 244px wide, `surface-raised`, radius 12px, `shadow-2` and padding 12px, and on a phone the screen's width less 8px each side. It shall offer its presets as one radio group of native radios, named by a heading over them, four to a row, each a 24px square in its colour with a 1px `border-control` edge, each named by its preset's name, and each a 48px target on a phone. The preset that names the current colour shall be picked, shown by a 2px `accent` ring with a 2px gap and a 14px check, white on a dark colour and ink on a light one. When it opens, focus shall go to the picked preset, or else the first. When the user picks a preset, the kit shall call `onChange` with its colour and show it in the hex field. When the user types six hex digits, with or without `#`, the kit shall call `onChange` with them at once, written `#RRGGBB`; a colour that isn't a preset shall leave none picked. While the text isn't six hex digits, the kit shall not call `onChange`, and when the user leaves the hex field or presses Enter in it, the field shall show the `hexError` under it and be `aria-invalid`; Enter there shall not submit a form. When the user presses Escape in it, the kit shall call `onClose` and give focus back to its opener. When the user presses outside it and outside its opener, or focus moves out of it, the kit shall call `onClose`. A press on its opener shall leave the opener's own click to open or close it. Each opening shall start from the current colour, without an earlier error. There shall be no `<input type="color">`. In forced colours a swatch shall keep its colour and a `CanvasText` edge, the pick and the focus shall be `Highlight`, and the picked swatch shall keep its check.

## Examples

- Given a closed ColourPopover for "#3B8BFF" with eight presets, the first of them "#3B8BFF",
  when the user clicks its opener,
  then it opens, the first preset is picked and has focus.
- Given it open,
  when the user picks "Violet" (#8B5CF6),
  then `onChange` is called with "#8B5CF6" and the hex field shows "#8B5CF6".
- Given it open,
  when the user types "#2a7f62" in the hex field,
  then `onChange` is called with "#2A7F62" and no preset is picked.
- Given it open,
  when the user types "#3B8BF" and presses Enter,
  then `onChange` isn't called and the field shows "Use six digits, like #3B8BFF.".
- Given it open,
  when the user presses Escape,
  then `onClose` is called and focus is on its opener.
