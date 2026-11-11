# kit.agent-page-tokens

- Status: active
- Since: 0.1.0
- Source: HAL-3516; base component specs 16 (revision 18), HAL-397 mockups

The kit's theme shall have exactly ten agent orb colours, `--character-1a` to `--character-5b`, each a plain hex in `:root`, not in `@theme`, and none reading `--halo-*`. Each orb edge (the `b` colour) shall reach 3:1 on `canvas`, `surface`, `surface-subtle`, `surface-muted`, `surface-raised` and both stack shades, in light and dark. `--stack-shade-1` shall be `surface-subtle`, and `--stack-shade-2` shall be `surface-muted`'s light value and `surface`'s dark value, so `surface-raised`, the first and the second shade get darker in that order in both modes. On both shades, `fg`, `fg-muted`, `fg-subtle`, `accent-text` and the four status colours shall reach 4.5:1 and `border-control` 3:1. `--stack-gap` (16px), `--stack-peek` (10px) and `--stack-inset` (12px) shall be plain `px` variables, not in `@theme`. `fg` and `fg-muted` shall reach 4.5:1 on `surface` under `--stack-scrim`. `bg-canvas-grid` shall draw a 20px dot grid of `--canvas-grid-dot` on `surface-subtle`, with no hard-coded colour.

## Examples

- Given the violet orb (`--character-5b`) in dark mode,
  when it sits on `surface-muted` (a hovered menu row),
  then its edge reaches 3:1.
- Given a card two behind in a stack in dark mode,
  when its fill is `--stack-shade-2`,
  then it is darker than the card in front of it, and `fg-subtle` on it reaches 4.5:1.
