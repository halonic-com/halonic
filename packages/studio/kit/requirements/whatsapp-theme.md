# kit.whatsapp-theme

- Status: active
- Since: unreleased
- Source: HAL-20674; build plan P1 on HAL-20617, the WhatsApp-mapped theme

The kit's theme shall take WhatsApp's surfaces in the hue of our blue: in light, `canvas` and `app-frame` `#f3f5fa` with white `surface`, `surface-raised` and `app-panel`; in dark, `canvas` and `app-frame` `#0a1630` (the sidebar, lighter than the panels) with `surface` and `app-panel` `#060d1d`. `fg` shall be `#090a0d` in light and `#f9fafd` in dark. On `canvas`, `surface`, `surface-subtle`, `surface-muted`, `surface-raised`, `app-frame` and `app-panel`, `fg`, `fg-muted` and `fg-subtle` shall reach 4.5:1 and `border-control` 3:1, in light and dark. The theme shall have `--spacing-rail` (64px), `--spacing-row` (72px), `--radius-panel` (8px), `--ease-press` and `--ease-menu`.

## Examples

- Given dark mode,
  when quiet text (`fg-subtle`) sits on the sidebar (`canvas`),
  then it reaches 4.5:1.
- Given light mode,
  when an input's edge (`border-control`) sits on a hovered row (`surface-muted`),
  then it reaches 3:1.
