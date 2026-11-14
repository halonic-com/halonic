# library.listed-tools-review-states

- Status: active
- Since: 0.1.0
- Source: HAL-850 (proposal, step 6); HAL-2213; Sofia's checklist part A.8 (HAL-2883); Noah's fallback frames T10-F49 to F54 (HAL-2908)

The Library feature shall show the review of a connector's listed tools without its buttons whenever there is no tool to decide on: while the tools are being read, when they couldn't be read, when Halonic refused the whole listing, when an approval can't be read, and when nothing is waiting. Each shall say so in the words of the catalogue and never show the store's own error. A tool its server keeps changing shall be approved by its own **Turn it on anyway** button, at the version shown. The review shall stay open while other tools wait for a decision, with the approved tool moved to Approved, and close with the toast once nothing is left to decide.

## Examples

- Given the tools are still being read,
  when the review opens,
  then it shows the title, the top line and loading rows, and no button that approves.
- Given the tools couldn't be read,
  when the review shows the failure,
  then **Try again** shows the loading rows while it reads them again, and the failure again if it fails again.
- Given Halonic refused the whole listing,
  when the review opens,
  then it says so with the reason, shows no rows and no buttons.
- Given an approval that can't be read and no tool name for it,
  when the review shows it,
  then **Remove approval** is unavailable and the reason is shown next to it.
- Given an approval that can't be read and a tool name for it,
  when the person asks for **Remove approval**,
  then that tool's approval is removed, and the store's own error is never shown.
- Given every tool is approved,
  when the review opens,
  then it says "Nothing is waiting for your approval." with the Approved group below and no buttons.
- Given a tool its server keeps changing,
  when the person asks for **Turn it on anyway**,
  then only that tool is approved, at the version shown.
- Given a tool its server keeps changing and other tools still to review,
  when the person asks for **Turn it on anyway**,
  then that tool moves to Approved and the review stays open (Liam's decision, HAL-8338).
- Given a tool its server keeps changing and nothing else waiting,
  when the person asks for **Turn it on anyway**,
  then the review closes with the toast for the approved tool.
