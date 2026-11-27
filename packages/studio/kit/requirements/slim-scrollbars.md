# kit.slim-scrollbars

- Status: active
- Since: unreleased
- Source: the board's request on HAL-20556 (scrollbars should be slick, modern and small)

The kit's theme shall give every scrolling region in the Studio, the Messenger and the Inbox one scrollbar style, with no copy of its own in an app. The scrollbar shall be thin, about 6px where the engine lets the theme set its width, with no arrow buttons, and a rounded thumb in the mode's text colour at a low alpha (about 3:1 against the surface) on a see-through track, so it fits the light and the dark theme. While the pointer is over a region or keyboard focus is inside it, the region's thumb shall show; at rest, and after a pointer click alone, it shall not. When the system asks for more contrast, the thumb shall show at rest too, in a stronger alpha. In forced colours the system's own scrollbar shall show. A part that hides its scrollbar on purpose shall still be able to.

## Examples

- Given any scrolling region,
  when the theme's CSS is built,
  then its scrollbar is thin with a see-through track, and its thumb shows on hover and focus.
- Given an engine with the `::-webkit-scrollbar` parts (Chromium in WebView2, WebKit),
  when the theme's CSS is built,
  then the scrollbar is drawn from those parts as a 6px rounded thumb with no arrow buttons, and
  the standard `scrollbar-width` and `scrollbar-color` are left unset for it.
- Given a click on a row in a scrolling list,
  when the pointer leaves the list,
  then the list's thumb hides, as focus from the pointer doesn't show it.
- Given a part with `[scrollbar-width:none]`,
  when the theme's CSS is built,
  then the part's own rule wins over the theme's.
