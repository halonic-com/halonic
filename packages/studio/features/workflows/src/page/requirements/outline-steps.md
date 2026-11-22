# workflows.page.outline-steps

- Status: draft
- Since: unreleased
- Source: HAL-13180 (agent map PR 5); C618 #4 (HAL-15708, the line on screen, titles); flow-workflows 9 (agent map workflow card, `select`); flow-agents 6 "Clicks on the map"; UX checklist 9.9 clicks; the steps' names, C617-4 (HAL-15716)

When the workflow page is opened, or asked again while it is open, with steps to outline (`openItem`'s `select:` step, as the agent map's workflow card opens it), the workflows feature shall show the Flow tab with those steps' cards outlined by a dashed accent border and no step card open, and, when the outlined steps that are still in the file all run one agent, shall show over the canvas "<n> steps use <agent>: <steps>" followed by "Pick a step or an empty spot to clear the outline." while the outline is on, and read that first line once to screen readers, the steps named in the file's order, joined by commas, each as its card shows it: its title, its id when it has none, and "*title* (*id*)" when two steps share a title. Picking a step or a click on the canvas's background (not a pan) shall drop the outline and the line.

## Examples

- Given Support reply runs Sorter in `triage` (titled "Read the email") and `draft` (no title), when Sorter's map opens it, then Flow shows with `triage` and `draft` outlined, no step card is open, "2 steps use Sorter: Read the email, draft" and "Pick a step or an empty spot to clear the outline." show over the canvas, and the first line is read once.
- Given it runs Sorter only in `triage`, then "1 step uses Sorter: Read the email" is read.
- Given `triage` is titled "Triage" and `draft` and `polish` are both titled "Reply", when all three are outlined, then "3 steps use Sorter: Triage, Reply (draft), Reply (polish)" is read.
- Given the page shows Configuration, when it is asked again to outline `triage`, then it goes to Flow with `triage` outlined.
- Given a phone, when Sorter's map opens Support reply, then its page shows on Flow with `triage` and `draft` outlined, view-only: no toolbar, no ports.
- Given the steps are outlined, when the user clicks `draft`, then no step is outlined, the line is gone and `draft`'s card opens.
