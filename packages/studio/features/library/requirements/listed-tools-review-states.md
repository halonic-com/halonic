# library.listed-tools-review-states

- Status: active
- Since: 0.1.0
- Source: HAL-850 (proposal, step 6); HAL-2213; Sofia's checklist part A.8 (HAL-2883); Noah's fallback frames T10-F49 to F54 (HAL-2908)

The Library feature shall show the review of a connector's listed tools without its buttons whenever there is no tool to decide on: while the tools are being read, when they couldn't be read, when Halonic refused the whole listing, when an approval can't be read, and when nothing is waiting. Each shall say so in the words of the catalogue and never show the store's own error. A tool its server keeps changing shall be approved by its own **Approve this version** button, at the version shown, and the review shall close with the toast for one approved tool.

## Examples

- Given the tools are still being read,
  when the review opens,
  then it shows the title, the top line and loading rows, and no button that approves.
- Given the tools couldn't be read,
  when the review shows the failure,
  then **Try again** reads them again.
- Given an approval that can't be read and no tool name for it,
  when the review shows it,
  then **Remove approval** is unavailable and the reason is shown next to it.
- Given every tool is approved,
  when the review opens,
  then it says "Nothing is waiting for your approval." with the Approved group below and no buttons.
- Given a tool its server keeps changing,
  when the person asks for **Approve this version**,
  then only that tool is approved, at the version shown.
