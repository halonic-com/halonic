# routines.page.frame-and-states

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 5); flow-routines 3.1, 3.2 and 3.10; microcopy 12.3; states RT

The `routine` item shall open in its own tab with a page that shows the routine's letter avatar, "ROUTINE" and its name, then the routine as one line (muted, with "Off · " in front, when it is off), then the quiet line "Changes not live yet" while saved changes aren't in a version, or, for a routine that is on but has never been live, the notice "This routine isn't live yet, so it doesn't run." and nothing else; and shall show a skeleton after 300 ms, why the routine couldn't be read with **Try again**, and the item-gone state with **Go to Routines** for a routine that isn't in the workspace.

## Examples

- Given the routine "Daily" is on and live, then the page shows "ROUTINE", the heading "Daily" and its summary "Weekdays at 07:30 → Briefing", and no notice.
- Given the routine is off, then the summary reads "Off · Weekdays at 07:30 → Briefing" in the muted colour.
- Given the routine has saved changes that aren't live, then "Changes not live yet" shows under the summary.
- Given the routine is on and has never been live, then the notice shows and "Changes not live yet" does not.
- Given the window is a phone, then the heading is for screen readers only and the header stacks.
- Given the read takes over 300 ms, then screen readers hear "Loading daily"; after 10 s the page adds "Still loading" and **Try again**.
- Given the read fails, then the page shows "Couldn't load this routine", the reason and **Try again**, which reads again and gives the heading the focus.
- Given the routine isn't in the workspace, then the page says it isn't there any more with **Go to Routines**.
- Given the host says the routine changed, then the page reads it again without showing a skeleton.
- Given Ctrl K is searched for "daily", then the routine is offered with its hub and its summary, and choosing it opens its tab.
