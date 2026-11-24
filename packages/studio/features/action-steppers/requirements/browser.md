# action-steppers.browser

- Status: active
- Since: unreleased
- Source: HAL-17527 (approvals stream HAL-17488, PR 8); architecture note on HAL-17491; the board's decision on HAL-10 (24 Nov) that the screens follow the approved Inbox look, sections 7.1 (browser blocks) and 8.4 (Copy instructions)

The stepper shall show, for each browser step, the full address it opens and its numbered instructions as plain text, under "Checked on <date>" for a library step or "Instructions from <requester>, not checked by Halonic" for the requester's own. When a browser step is the next step, the stepper shall offer **Open the page**, which asks the desktop app to open the address, **Copy instructions**, which copies the address and the numbered lines, after the "not checked" label on a requester's step, an optional field for the result, which is never a secret field and, on a requester's step, says "From <requester>, not checked by Halonic" under it, and **Step 2 is done**, which passes on what was pasted. A request with a browser step shall have no **Run all steps**.

## Examples

- Given a requester's browser step with the line `Open [this](https://evil.example)`,
  when it shows,
  then it says "Instructions from Chief on Paperclip · Acme, not checked by Halonic" and the line shows its brackets, with no link.
- Given a library step checked on 20 Nov,
  when it shows,
  then it says "Checked on 20 Nov".
