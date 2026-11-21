# inbox.request-not-started

- Status: draft
- Since: unreleased
- Source: HAL-12412 (UX check S6 of HAL-12390, rules E4 and E5); microcopy 10.3 and 22 F13; HAL-15067 (design check C533-2 and C533-3 of HAL-15056)

When a request doesn't start, the Inbox shall word its reason as the Run panel and the run page's **Run again** do, after its own lead "Not started:", followed by the refusal's next step when it has one, and show the command that step leads to in a CommandBox under the line. The reason shall be lower case after the colon unless it starts with a name. There shall be no **Try again**: **Send** is there and the message is kept. A failure Halonic can't explain shall read "Not started: Halonic ran into a problem it can't explain yet." with **Copy details** after it, on the desktop form and in the phone's sheet, and never say the engine isn't answering, because the request never left the window. On the desktop form the alert shall hold only the "Not started: …" sentence; a "· Copy details" or "· Change budget" after it sits outside the alert and wraps as one piece.

## Examples

- Given a request that fails with an error that has no kind,
  when the person presses **Send**,
  then the alert reads "Not started: Halonic ran into a problem it can't explain yet.", "· Copy details" follows it outside the alert, and **Copy details** puts the error on the clipboard.
- Given a request refused with "The workflow changed.",
  when the person presses **Send**,
  then the line reads "Not started: the workflow changed." with no **Copy details**.
- Given a request refused because Acme is already running in another Halonic, with the next step "Stop that one, then try again.",
  when the person presses **Send**,
  then the line reads "Not started: Acme is already running in another Halonic on this computer. Stop that one, then try again." with no **Try again**, on the desktop form and in the phone's sheet.
- Given a request refused with the next step "To start it, run this in a terminal:" and the command `halonic run reply`,
  when the person presses **Send**,
  then `halonic run reply` shows in a CommandBox under the line.
