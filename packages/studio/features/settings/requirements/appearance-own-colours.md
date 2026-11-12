# settings.appearance-own-colours

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); flow-settings 5 and 10 (HAL-646); g5-frames T11-F14 (HAL-1143); ux-checklists-t4-t5-t11 3.8 (HAL-1185); microcopy 13.1 and 19.8 (HAL-751)

When the user picks "Your own" under Frame colours, Settings shall show two colour fields side by side, "First colour" and "Second colour", which start from the colours of the preset picked before. Each field's swatch button shall be named "Choose the first colour, now #3B8BFF" (or the second) and open the kit's colour popover. A typed colour shall be taken when the user leaves the field or presses Enter, in any case and with or without `#`, and shall show as `#3B8BFF`. Anything else shall show "Enter a colour like #3B8BFF." under the field once the user leaves it, and the swatch and the frame shall keep the last good colour.

## Examples

- Given the frame colours are "Green and blue",
  when the user picks "Your own",
  then the fields show `#10B981` and `#3B8BFF`.
- Given Your own is picked,
  when the user types `22d3ee` as the second colour and leaves the field,
  then the frame's second colour is `#22D3EE` and the field shows `#22D3EE`.
- Given Your own is picked,
  when the user types `blue` as the first colour and leaves the field,
  then "Enter a colour like #3B8BFF." shows and the first colour stays `#3B8BFF`.
