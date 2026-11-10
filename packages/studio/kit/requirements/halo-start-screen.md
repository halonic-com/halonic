# kit.halo-start-screen

- Status: active
- Since: 0.1.0
- Source: HAL-3516; base component specs 16 (revision 16), visual language revision 4

The kit's theme shall have exactly six halo utilities: `bg-halo-frame`, `bg-halo-tint`, `bg-halo-wash`, `bg-halo-line`, `bg-halo-spot` and `shadow-halo-glow`, none holding a hard-coded colour. `bg-halo-spot` shall draw the two halo tints as a left-to-right gradient, masked to fade out from its middle. `shadow-halo-glow` shall be two 16px-blur shadows, the halo blue 6px to the left and the halo violet 6px to the right, at 40% in light and 48% in dark, and there shall be no `--shadow-halo*` token. `--halo-tint-blue` and `--halo-tint-violet` shall be made from `--halo-blue` and `--halo-violet` with `color-mix()`, so a frame colour preset sets only those two. With each of the four presets, in light and dark, at both ends of the gradient, `fg`, `fg-muted` and `accent-text` on the spot over `surface`, and `fg-muted` on the window frame over `canvas`, shall reach 4.5:1.

## Examples

- Given the green preset (`#10B981` / `#3B8BFF`) in dark mode,
  when `fg-muted` sits on `bg-halo-spot` over `surface`,
  then it reaches 4.5:1 at both ends.
- Given `shadow-halo-glow` on the start screen's composer wrapper,
  when Tailwind builds it,
  then it is a `box-shadow` of the two halo hues, not a `--shadow-*` token.
