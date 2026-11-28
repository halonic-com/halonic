# shell.rail-dot

- Status: active
- Since: unreleased
- Source: HAL-20745 (the Lead dot of P3 in the HAL-20617 build plan); RAIL-ICONS.md on HAL-20672; names agreed on HAL-20936

While a rail entry is selected, the icon rail shall show one white dot, 6px, at the centre of that entry's button, hidden from screen readers and not clickable. While no entry is selected, the rail shall show no dot. When the selection moves to another entry, the dot shall travel in a straight line from the old button's centre to the new one's with the Web Animations API, over `--duration-dot-lead` on the curve `--ease-dot`, thinning to 67% of its width and stretching to 136% of its length at the middle of its way on a linear clock, and nothing else shall move. When the selection moves while the dot is travelling, the dot shall start again from where it is. When the buttons move while the selection stays, the dot shall go to its button's new centre without a motion. The shell shall read the motion to play from the attribute `data-rail-dot-motion` on the window's root element at each move, as one of `lead`, `streak` and `pulse`, and shall play Lead where the attribute is missing or names anything else. While the person prefers reduced motion, the dot shall not travel or change shape: it shall fade out at the old button and in at the new one over `--duration-rail-fade`, linear.

## Examples

- Given Home is selected,
  when the person clicks Inbox,
  then the dot travels from Home's button to Inbox's in 360ms and no button moves.
- Given the root element has `data-rail-dot-motion="sparkle"`,
  when the selection moves,
  then the dot moves as Lead.
- Given the person prefers reduced motion,
  when the selection moves,
  then the dot fades out on the old button and in on the new one in 150ms.
- Given the active tab shows the Search page, which no entry holds,
  when the rail is shown,
  then it shows no dot.
