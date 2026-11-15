# workflows.canvas.step-cards

- Status: draft
- Since: 0.1.0
- Source: HAL-9865 (T7 PR 3); flow-workflows 4.1; states C2; UX checklist 10

When the page shows a workflow, the workflows feature shall draw a card for each step with its kind, its id and, for an agent step, its agent or "No agent", mark the first step "Start", draw an arrow for each way a step leads on, let the person select a step, and fit the steps in the view on opening and on **Fit to screen**.

## Examples

- Given `start → done` with no agent, then the cards read "AGENT STEP start Start No agent" and "END done", and one arrow joins them.
- Given an agent step with the agent `writer`, then its card says "writer".
- Given the person presses a card, then it is the pressed card, and pressing another moves that.
- Given the person zooms in with the button and presses **Fit to screen**, then all steps show again.
