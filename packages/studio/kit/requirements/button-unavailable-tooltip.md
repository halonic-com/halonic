# kit.button-unavailable-tooltip

- Status: active
- Since: unreleased
- Source: HAL-15253, Noah's decision on HAL-15139 (option 2, kit-wide; a team decision under HAL-2282, from Iris's flow check C544); base component specs 1 (Button) and 14 (Tooltip)

While a `Button` is given `unavailable={{ reason }}` and the first element its `reason` names has text, the kit shall give the button a tooltip with that text's first line, as laid out on the page, which shows, hides and looks as `kit.tooltip` says: after 500ms of mouse or pen hover or at once on keyboard focus, never on touch, hidden on leave, blur, a press or Escape, and that Escape shall go no further. The tooltip shall be hidden from screen readers and shall not describe the button, so the reason is read once, through `aria-describedby` (`kit.button-unavailable`). The button shall keep its unavailable look on hover. While the button has that tooltip, a `Tooltip` round it shall not show.

## Examples

- Given `<Button unavailable={{ reason: "why" }}>Make a version</Button>` and the text "Finish getting updates first." with id `why`,
  when a mouse pointer rests on the button for 500ms,
  then the tooltip "Finish getting updates first." shows, and the button is described by `why` only.
- Given the same button with keyboard focus and its tooltip shown, inside a Dialog,
  when the user presses Escape,
  then the tooltip hides, the Dialog stays open and the button keeps focus.
- Given Run, unavailable with the band "Broken flow can't run: it has 1 problem." over "Fix it before it can run.",
  when the user hovers Run,
  then the tooltip says "Broken flow can't run: it has 1 problem." only.
- Given an answer button with the Tooltip of its full label, unavailable,
  when the user hovers it,
  then only the reason's tooltip shows; once it's available again, the label's Tooltip shows.
