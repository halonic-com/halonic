# shell.palette-options

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.3 (HAL-175); UX checklist part 1, 1.7 (HAL-1323); accessibility pass 1.6 (HAL-967); microcopy 19.2

The Ctrl K palette shall offer its rows as one list of options, group after group. When the user presses ↓ or ↑ in the palette's box, the palette shall make the next or the previous option active, wrapping from the last to the first and back. When the user presses Enter, the palette shall open the active option here, and when the user presses Mod Enter, in a new tab. While the palette is open, Tab and Shift Tab shall keep the focus in the box, Home and End shall move in the box's text, and Mod K shall select the box's words rather than close the palette. When the words change, the palette shall make the first option active. When results for the same words arrive later, the option the user made active shall stay active while it is listed. Each option shall be named with its name, its kind when it has one, and "switch to tab" when a window tab shows it. When typing stops, the palette shall say how many options it shows, or that there are no results, or, when a search provider failed and nothing shows, that it couldn't search.

## Examples

- Given the palette lists "Support reply", "Refund checker" and the action "New tab", with "New tab" active,
  when the user presses ↓,
  then "Support reply" is active.
- Given the user made "Refund checker" active,
  when a search provider's results arrive for the same words,
  then "Refund checker" stays active.
- Given a tab shows the workflow "Support reply",
  when the palette lists it,
  then a screen reader reads "Support reply, workflow, switch to tab".
- Given the palette is open,
  when the user presses Ctrl K,
  then the box's words are selected and the palette stays open.
- Given the palette lists 7 options,
  when typing stops,
  then "7 results" is said.
