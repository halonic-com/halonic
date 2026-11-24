# assistant.build.card-changed-outside

- Status: active
- Since: unreleased
- Source: HAL-16799 (T14 PR 8b); flow-assistant 3.3 and 3.4 (HAL-647); review panel notes 1 and 4 (HAL-1307, HAL-3820)

When a decision on a proposal card finds that its file changed outside Halonic, the card shall say "*item* changed outside Halonic. Compare first." with **Compare**, which opens the file where Compare is, and keep **Accept all** and **Reject all** unavailable with that line as their reason. When the person then chooses the version from outside, the card shall show the `neutral` chip **Replaced** with "Replaced by the version from outside Halonic." and tell the model "(The file *path* was replaced by a version from outside Halonic. Your changes to it are gone.)". When a decision finds the card's changes out of date, the card shall read them again without an error toast, keep focus in the card and say "The file changed. Showing the latest changes."

## Examples

- Given a card whose file changed outside Halonic, when the person clicks Accept all,
  then the card says "triage changed outside Halonic. Compare first." and Accept all is unavailable with that reason.
- Given that card, when the person chooses Use the other one in Compare,
  then the card reads "Replaced" and "Replaced by the version from outside Halonic.".
- Given a decision that answers `stale`, then no error toast shows and the card says "The file changed. Showing the latest changes."
