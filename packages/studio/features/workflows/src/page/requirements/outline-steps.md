# workflows.page.outline-steps

- Status: draft
- Since: unreleased
- Source: HAL-13180 (agent map PR 5); flow-workflows 9 (agent map workflow card, `select`); flow-agents 6 "Clicks on the map"; UX checklist 9.9 clicks

When the workflow page is opened, or asked again while it is open, with steps to outline (`openItem`'s `select:` step, as the agent map's workflow card opens it), the workflows feature shall show the Flow tab with those steps' cards outlined by a dashed accent border and no step card open, and shall read once to screen readers "<n> steps use <agent>: <ids>" when the outlined steps that are still in the file all run one agent, the ids in the file's order joined by commas. Picking a step or a click on the canvas's background (not a pan) shall drop the outline.

## Examples

- Given Support reply runs Sorter in `triage` and `draft`, when Sorter's map opens it, then Flow shows with `triage` and `draft` outlined, no step card is open, and "2 steps use Sorter: triage, draft" is read once.
- Given it runs Sorter only in `triage`, then "1 step uses Sorter: triage" is read.
- Given the page shows Configuration, when it is asked again to outline `triage`, then it goes to Flow with `triage` outlined.
- Given the steps are outlined, when the user clicks `draft`, then no step is outlined and `draft`'s card opens.
