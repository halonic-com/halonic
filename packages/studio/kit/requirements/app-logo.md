# kit.app-logo

- Status: active
- Since: unreleased
- Source: HAL-18693; the app logo set HAL-17379, approved with the Halonic apps card HAL-17358

The kit's `AppLogo` shall draw the Halonic ring of `HalonicMark` with the given app's glyph where the point of light sits: a point of light for `studio`, a message bubble for `messenger`, a tray for `inbox`, stacked layers for `workspaces`, brackets for `code`, the play shape for `runs` and a question mark for `ask`. The glyph shall take the text colour, and shall grow 1.4 times at 24px and under and 1.2 times at 32px, so that it stays readable. Given a `label`, the logo shall be an image with that name; without one, it shall be hidden from screen readers.

## Examples

- Given `<AppLogo app="messenger" />`,
  when it renders,
  then the ring holds the message bubble, grown 1.4 times, and screen readers skip it.
- Given `<AppLogo app="inbox" label="Halonic Inbox" pixels={48} />`,
  when it renders,
  then the ring holds the tray at its drawn size, and screen readers read an image named "Halonic Inbox".
- Given `<AppLogo app="studio" />`,
  when it renders,
  then the ring holds the point of light.
