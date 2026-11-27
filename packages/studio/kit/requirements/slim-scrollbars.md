# kit.slim-scrollbars

- Status: active
- Since: unreleased
- Source: the board's request on HAL-20556 (scrollbars should be slick, modern and small)

The kit's theme shall give every scrolling region in the Studio, the Messenger and the Inbox one scrollbar style, with no copy of its own in an app. The scrollbar shall be thin, about 6px where the engine lets the theme set its width, with a rounded thumb in the mode's text colour at a low alpha on a see-through track, so it fits the light and the dark theme. While the pointer is over a region or focus is inside it, the region's thumb shall show; at rest it shall not. When the system asks for more contrast, the thumb shall show at rest too. In forced colours the system's own scrollbar shall show. A part that hides its scrollbar on purpose shall still be able to.

## Examples

- Given any scrolling region,
  when the theme's CSS is built,
  then its scrollbar is thin with a see-through track, and its thumb shows on hover and focus.
- Given an engine without `scrollbar-color` (WebKit),
  when the theme's CSS is built,
  then the scrollbar is drawn as a 6px rounded thumb.
- Given a part with `[scrollbar-width:none]`,
  when the theme's CSS is built,
  then the part's own rule wins over the theme's.
