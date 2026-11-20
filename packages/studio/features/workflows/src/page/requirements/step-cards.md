# workflows.page.step-cards

- Status: draft
- Since: unreleased
- Source: HAL-9865 (T7 PR 3); flow-workflows 4.1; states C2; UX checklist 10; HAL-12619 (a11y check E1, E3)

When the page shows a workflow, the workflows feature shall draw a card for each step with its kind, its id and, for an agent step, its agent or "No agent", mark the first step "Start", draw an arrow for each way a step leads on, let the person select a step, and fit the steps in the view on opening and on **Fit to screen**.

The workflows feature shall name each card for a screen reader title first, then its kind, its Start chip and its agent, and describe where it leads from its arrows in the order their cards are drawn (left to right, then top to bottom, not the file's order), since the arrows are only drawn. The canvas shall be a group named "Workflow canvas", not an application, as it has no keys of its own. A card with keyboard focus shall show Studio's focus ring, with its gap, outside the card's selected or failed border.

## Examples

- Given `start → done` with no agent, then the cards read "AGENT STEP start Start No agent" and "END done", and one arrow joins them.
- Given an agent step with the agent `writer`, then its card says "writer".
- Given the person presses a card, then it is the pressed card, and pressing another moves that.
- Given "Read the email" leads only to "Classify it", then its card is described "Next: Classify it."
- Given "Classify it" leads to "Finished without a reply, because nobody needs to answer spam" and to "Draft a reply", in that order in the file, with no words on either arrow, and the canvas draws "Draft a reply" on the left, then its card is described "Next: Draft a reply, or Finished without a reply, because nobody needs to answer spam."
- Given "Approve this reply?" has an "Approve" arrow to "Finished with the reply approved" and a "Reject" arrow to "Finished without the reply", then its card is described "Approve: Finished with the reply approved. Reject: Finished without the reply."
- Given an end step, then its card has no description.
- Given the first step "Read the email" run by `writer`, then a screen reader names its card "Read the email AGENT STEP Start writer", and the card still shows the kind above the title.
- Given the person tabs to a card, then it shows Studio's focus ring, not the browser's outline, and a selected card keeps its accent border inside the ring.
- Given the person zooms in with the button and presses **Fit to screen**, then all steps show again.
