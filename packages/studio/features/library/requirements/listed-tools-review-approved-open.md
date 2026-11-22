# library.listed-tools-review-approved-open

- Status: active
- Since: unreleased
- Source: design check C667, row 2 (HAL-16046), decided by the designer on HAL-16074 (HAL-2282)

When nothing is waiting for a decision (`library.listed-tools-review-states`), the review of a connector's listed tools shall show its Approved group open, so each tool's **Remove approval** follows the "Nothing to review." line straight away; that line shall stand 8 px under the top line, as the kit's paragraphs do. While tools wait for a decision, the Approved group shall stay folded.

## Examples

- Given every tool from Notes server is approved, read_note among them,
  when the review opens from "3 tools are on.",
  then the Approved group is open and **Remove approval for read_note** is the first button after "Nothing to review.".
- Given 2 tools waiting and 1 approved,
  when the review opens,
  then the Approved group is folded.
