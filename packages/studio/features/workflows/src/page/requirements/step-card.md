# workflows.page.step-card

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b PR 1b); UX checklist 10.8; flow-workflows 5.1, 5.2; microcopy 9.4; save model (HAL-1300 note, 8.4); a11y 7.2

When a step is picked on the canvas on desktop, no run is shown and nothing else is docked, and the host can change steps, the workflows feature shall dock the step's card at the right, with the canvas beside it usable and undimmed: the title "Step <id>" taking focus, the breadcrumb "<workflow> › <id>", then the fields the step's kind has: **Prompt** for an agent step whose prompt is text (with "The agent gets the run input." while it is empty), **Save output as** for the kinds that run something (with "Later steps can pick this as step <name>." once it has one), and **Description** for every kind. Each field shall save by itself, after a pause in typing and when it is left, as one change of the step; a field that holds a key shall not be saved, shall say "This looks like a key. Keep it as a secret instead?" and shall count as not saved in the toolbar. When the host can't change the step, a danger toast shall say "Couldn't change step <id>" and why. Picking another step shall replace the card; Esc, ✕ and a click on the canvas's background (not a pan) shall close it and unselect the step; a press on the canvas's toolbar or zoom buttons, also between their buttons, is not on the background.

## Examples

- Given Support reply, when the user clicks `write`, then a card titled "Step write" has focus, reads "Support reply › write", and shows its prompt, "answer" under Save output as with "Later steps can pick this as step answer." and its description.
- Given the end step `done`, then its card has only Description; the agent step `start` with no prompt says "The agent gets the run input."
- Given the card of `write`, when the user changes the prompt and leaves the field, or stops typing in Save output as, then that field is saved as one change of `write`.
- Given a key pasted into Description, then it isn't saved, the card says "This looks like a key. Keep it as a secret instead?" and the toolbar counts 1 field not saved.
- Given the host can't change the file, then a danger toast says "Couldn't change step write" and why.
- Given the card of `write`, when the user clicks `done`, then the one card is now "Step done".
- Given the card of `write`, when the user presses Esc, clicks ✕ or clicks the canvas's background, then it closes and `write` isn't selected; dragging the background, or pressing the toolbar's divider or between the zoom buttons, keeps it open.
- Given a host that can't change steps, or a phone, then picking a step docks no card.
