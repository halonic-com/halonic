# kit.waiting-line

- Status: active
- Since: unreleased
- Source: HAL-13409; HAL-14950 (`keepRoomFor`, C513 M11); first-run-progress revision 2 (HAL-7986), section 2 "Rules for the waiting line", approved by the board on 19 Nov (HAL-7993)

The kit's `WaitingLine` shall be the one line Studio shows while it waits: a still 6px dot in the `running` colour, hidden from screen readers, then what Studio waits for in `fg`, the time waited in `fg-muted` with tabular figures, the reason in `fg-muted` under it, and its actions as text buttons under them, all in `text-small`. It shall show nothing before 2 seconds. It shall show the time in seconds ("14 s") below a minute and as m:ss ("2:10") from a minute, never as a bar. It shall show the reason only when one is given and only from 10 seconds. Its placement shall be `inline` (no frame), `row` (no frame, 4px under a row's hint) or `banner` (a `radius-md` box with a 1px `border` edge on `surface-muted`), and it shall use only existing tokens. Its status region (`role="status"`) shall be in the page from the moment the line is mounted, before 2 seconds too, and hold only what it waits for and the reason, so screen readers hear the line when it appears and when those words change, never on each second. With `keepRoomFor`, the line shall keep room, from the moment it shows and at any width, for the tallest of the reasons and the action labels it names, unseen and hidden from screen readers and outside its status region, so a later reason or action moves nothing on screen. The dot shall never move, so reduced motion has nothing to stop. `useWaitedMs(since)` shall give the milliseconds since `since` and draw its component again every second.

## Examples

- Given a WaitingLine "Waiting for Anthropic" at 1.9 seconds,
  when it renders,
  then nothing shows, and its status region is in the page and empty.
- Given the same line at 3 seconds,
  when it renders,
  then it shows the dot, "Waiting for Anthropic" and "3 s", and the status region reads "Waiting for Anthropic".
- Given a line with the reason "It loads the model first, so the start is slow." at 9 seconds,
  when it renders,
  then the reason doesn't show; at 10 seconds it shows and the status region holds it.
- Given a line at 3 seconds that keeps room for "The first start takes longer than the next ones.", "Still starting. The first start unpacks Halonic's files, which can take up to a minute." and **Something wrong?**,
  when it shows the longer reason and **Something wrong?** at 34 seconds,
  then its box is as high as it was at 3 seconds, and its status region never held the unseen words.
- Given a line at 130 seconds,
  when it renders,
  then the time reads "2:10".
- Given a line with the action "Pick another model",
  when the user presses it,
  then its `onClick` is called.
