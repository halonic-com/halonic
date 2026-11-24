# assistant.build.proposal-card

- Status: active
- Since: unreleased
- Source: HAL-16798 (T14 PR 8a); flow-assistant 3.1 and 3.2 (HAL-647); component specs 21.2 (HAL-175); microcopy 14.2 (HAL-751)

When a `propose_file` or `propose_delete` wrote changes to review, the Build chat shall show a card for it in place of its tool line: an `article` named by its tag (**New**, **Changed** or **Delete**) and its sentence, which is the item's name and Changes' first line for the change ("Support triage: 2 steps added"), then the path, the model's why in quotes and a closed **Show the diff**. While the card has changes to review, it shall show **Review**, **Accept all** and **Reject all**, and once some of them were decided elsewhere, the line "*n* of *m* changes left to review" above them. **Review** shall open the item's page (an agent, a workflow or a routine), else the file, else for a delete the Changes page. A write that was refused shall show only its tool line, and a card shall never say "Saved".

## Examples

- Given the model changed `hubs/sales/workflows/triage.workflow.yaml` with the why "Pages on-call",
  then the chat shows a card named "Changed: triage: …", the path and "“Pages on-call”", with Review, Accept all and Reject all.
- Given that card, when the person opens Show the diff,
  then the removed lines show with − and the added ones with +.
- Given that card had 3 changes and 1 is left to review,
  then the card says "1 of 3 changes left to review".
- Given a `propose_delete` the tool made, when the person clicks Review, then Changes opens.
- Given a `propose_file` the tool refused, then the chat shows its tool line and no card.
