# assistant.build.phone-review

- Status: active
- Since: unreleased
- Source: HAL-17739 (T14 PR 18c); flow-assistant 11.3, 11.4 and 11.6 (HAL-647); microcopy 14.3 (HAL-751); component specs 0.2, 15.3, 15.4, 21.2 and 21.4 (HAL-175); UX checklist T14 part 1 (HAL-1361)

Where the Studio shows the phone layout, a card with changes to review shall show **Accept all** on its own row, then **See what changes** and **Reject all**, which share a row only when both fit, in place of **Review**, **Show the diff** and the desktop buttons. **See what changes** shall open the sheet "What changes" over the chat, with the card's sentence, path and why, then the whole diff with its + and − signs and no line numbers, and **Accept all** above **Reject all** at its foot. A decision in the sheet shall decide the whole card, close the sheet and put the focus on the card's state line. While Halonic on the computer isn't answering, a card's **Accept all** and **Reject all**, on the card and in the sheet, shall wait, still focusable, with "Waiting for Halonic on your computer." under the card's buttons and in the sheet as their reason. While the file waits on Compare, the sheet's buttons shall wait with the card's line as their reason. The strip above the box shall be at least 56px high with touch-sized buttons, and while the chat answers its count shall read "*n* to review", with "Wait for the answer to finish." under it.

## Examples

- Given the phone layout and a card with 2 changes to review,
  then its buttons are, in order, "Accept all", "See what changes" and "Reject all".
- Given that card, when the person taps See what changes,
  then a sheet titled "What changes" shows the diff, with "Accept all" then "Reject all" at its foot.
- Given that sheet, when the person taps Accept all,
  then the card's changes are accepted, the sheet closes and the focus is on "Accepted · Now a change in triage.".
- Given the phone layout and Halonic on the computer not answering,
  then the card's Accept all and Reject all wait, with "Waiting for Halonic on your computer." under them.
- Given the phone layout, 2 items to review and the chat answering,
  then the strip reads "2 to review" with "Wait for the answer to finish." under it.
