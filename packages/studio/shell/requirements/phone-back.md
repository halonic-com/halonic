# shell.phone-back

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2, PR 14c); phone layout 2 "Where Back goes" (HAL-330); component specs 15.1 and 15.2 (HAL-175); close stack (HAL-973)

Where the Studio shows the phone layout, when the user presses the system's back, the shell shall cancel the innermost open modal dialog if there is one, else close the close stack's first layer if there is one, else go one page back in the place shown, or to Home from the top of Inbox, Runs or More. When the user presses back at the top of Home, the shell shall let the system have the press, so the Studio is left; if the Studio is still shown after that, the shell shall handle back again from the next page move. The top bar's Back button shall go back the same way as a page move. After every move that changes the page, the shell shall move focus to the new page's `h1`. The top bar shall show the page's title, with Back only under the top of a place, and the bottom navigation shall show only on a place or a list.

## Examples

- Given Workflows opened from More and the item Support reply opened from it,
  when the user presses back three times,
  then the phone shows Workflows, then More, then Home.
- Given Home at its top,
  when the user presses back,
  then the Studio steps back out of the page's history and the system has the press.
- Given a picker sheet open over Inbox,
  when the user presses back,
  then the sheet closes and Inbox stays.
- Given a modal dialog open,
  when the user presses back,
  then the dialog cancels, as its Cancel button would, and nothing else closes.
- Given a picker dialog open inside a form dialog,
  when the user presses back,
  then the picker cancels and the form stays open.
- Given the Studio as the first page in its browser tab, at the top of Home,
  when the user presses back, then opens Inbox and presses back again,
  then the phone shows Home.
- Given the user on Inbox,
  when they open Support reply and press back,
  then focus is on Inbox's `h1`.
- Given Home shown at its top,
  when the user taps Home in the bottom navigation,
  then nothing moves and focus stays on the tapped item.
