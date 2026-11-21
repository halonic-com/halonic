# inbox.request-not-started

- Status: draft
- Since: unreleased
- Source: HAL-12412 (UX check S6 of HAL-12390, rule E5); microcopy 10.3 and 22 F13

When a request doesn't start, the Inbox shall word its reason as the Run panel and the run page's **Run again** do, after its own lead "Not started:". The reason shall be lower case after the colon unless it starts with a name. A failure Halonic can't explain shall read "Not started: Halonic ran into a problem it can't explain yet." with **Copy details** after it, on the desktop form and in the phone's sheet, and never say the engine isn't answering, because the request never left the window.

## Examples

- Given a request that fails with an error that has no kind,
  when the person presses **Send**,
  then the line reads "Not started: Halonic ran into a problem it can't explain yet. · Copy details" and **Copy details** puts the error on the clipboard.
- Given a request refused with "The workflow changed.",
  when the person presses **Send**,
  then the line reads "Not started: the workflow changed." with no **Copy details**.
