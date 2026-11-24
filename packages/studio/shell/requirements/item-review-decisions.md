# shell.item-review-decisions

- Status: active
- Since: unreleased
- Source: HAL-17297 (T14 PR 14b-2, HAL-1307); AI changes 1.2 and 1.3 (HAL-3228); T14 review panel notes 1 to 5 (HAL-3820)

The shell's `useItemReview` shall read an item's changes to review from its page's `ItemReviewHost`, again each time the host says they changed, and give the page the item bar and the marks' decisions; `ItemChangeMark` shall show one change's mark. Each Accept or Reject, and Accept all or Reject all, shall be one decision with a toast "Accepted 3 changes in <item>" or "Rejected 1 change in <item>" and **Undo**, which puts the decision back; an Undo the file changed since shall make the bar say "Changed outside Halonic". A decision on a review read before the file changed shall read it again without a word; one that can't be made apart from the rest of the file shall say so in a toast that points to Accept all and Reject all; one that fails shall say "Couldn't save: <reason>". A change that needs others (`needs`) shall be decided with them, as `changesDecided` lists them: Accept takes along the changes it needs, Reject the changes that need it, each in turn. Its mark shall name them under its sentence ("Accept also accepts: …", "Reject also rejects: …"), and the toast shall count them all.

## Examples

- Given a step added and an arrow changed to go to it,
  when the arrow's mark shows,
  then it says "Accept also accepts: Step added: Check", and its Accept toasts "Accepted 2 changes in Support reply".
- Given a decision whose review was out of date,
  when the host answers `stale`,
  then the page reads the review again and shows no toast.
- Given a decision that fails with "The disk is full.",
  then a toast says "Couldn't save: The disk is full.".
