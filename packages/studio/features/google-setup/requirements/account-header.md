# google-setup.account-header

- Status: active
- Since: 0.1.0
- Source: HAL-712; google-setup-flow (HAL-621) sections 2.1 and 2.3; ux-checklists (HAL-1019) sections 2.1 and 9 (U4)

The Google setup view shall head the item with "Google for" and the account's address, and the step it is at ("Step 3 of 7"), then a line naming the ticked services and the account type with **Change** (a screen reader reads a comma, not "middle dot", between them), then the line "Uses your own Google app, on this computer." with **Other ways (later)**. When saving the account type fails, the view shall say "Couldn't save the account type: *reason*." in a Callout that takes focus, with **Try again** that saves again. The names come from the account's services, never from Studio's code. When the account's address needs asking, the view shall ask "What kind of Google account is …?" as a radio group in place of the first line, save the answer at once, and show no step until it is answered. **Change** shall open the same question with the current answer picked and a **Cancel**; picking an answer or choosing **Cancel** shall close it and return focus to **Change**. While the engine isn't answering, the answers shall be unavailable, with the reason as their note. **Other ways (later)** shall open a panel with no buttons and set `aria-expanded`.

## Examples

- Given an account for x@example.com with the services Ledger and Atlas at step 3,
  when the item opens,
  then the header reads "Google for x@example.com", "Step 3 of 7", "For Ledger and Atlas · Personal Google account" and "Uses your own Google app, on this computer.".
- Given an account whose address needs asking,
  when the item opens,
  then the radio group "What kind of Google account is x@example.com?" shows with neither answer picked and no step is listed.
- Given the question is open,
  when you pick "Work or school account (Google Workspace)",
  then the account type is saved as workspace.
- Given a personal account,
  when you choose **Change**,
  then the question opens with "Personal Google account" picked.
- Given the route line,
  when you choose **Other ways (later)**,
  then a panel with no button shows and the control's `aria-expanded` is true.
- Given the question opened with **Change**,
  when you choose **Cancel**,
  then the question closes, nothing is saved and **Change** has focus.
- Given the engine isn't answering,
  when the question shows,
  then both answers are unavailable and say "The engine isn't answering."
