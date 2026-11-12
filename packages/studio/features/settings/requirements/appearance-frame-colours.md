# settings.appearance-frame-colours

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); HAL-6655; req-settings `settings.appearance.frame-colours` (HAL-110); flow-settings 5 (HAL-646); ux-checklists-t4-t5-t11 3.7 and 3.8 (HAL-1185)

The Studio shall show the frame round the window in the two frame colours of the chosen preset, or in the person's own two colours. The presets shall be "Blue and purple" (`#3B8BFF` and `#B05ED9`), the default, "Green and blue" (`#10B981` and `#3B8BFF`), "Yellow and orange" (`#FBBF24` and `#F97316`) and "Pink and violet" (`#EC4899` and `#8B5CF6`), the same four the kit's halo contrast is checked with. The frame colours shall set only the two halo colours, never the accent or primary colour. When the stored frame colours can't be read, or the person's own colours aren't exactly two six-digit hex colours, the frame shall use "Blue and purple".

## Examples

- Given no frame colours are stored,
  when the window opens,
  then `--halo-blue` is `#3B8BFF` and `--halo-violet` is `#B05ED9`.
- Given "Pink and violet" is stored,
  when the window opens,
  then `--halo-blue` is `#EC4899` and `--halo-violet` is `#8B5CF6`.
- Given the own colours `3b8bff` and `#22d3ee` are stored,
  when the window opens,
  then the halo colours are `#3B8BFF` and `#22D3EE`.
- Given the own colours `blue` and `#22D3EE` are stored,
  when the window opens,
  then the frame uses "Blue and purple".
