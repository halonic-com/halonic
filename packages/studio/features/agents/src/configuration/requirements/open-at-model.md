# agents.configuration.open-at-model

- Status: draft
- Since: unreleased
- Source: HAL-12499 (UX check R6 on HAL-12390: the run page's **Choose a local model for *Sorter*** opens Sorter's model setting)

When an agent's page is opened with the step `model` (`openItem(agent, { step: "model" })`), the agents feature shall show its Configuration on the Model page and put the focus on the model picker, after the page's heading took it. Opened with the step again while the page is open, it shall do so again, also after the person moved to another tab or page. Each request shall move the focus once: picking the Model page by hand later shall leave the focus on the page's list. Opened without the step, the page shall open as before, on Configuration › Behaviour. When the aliases can't be read, the Model page shall say so as usual and the focus shall stay where the window put it.

## Examples

- Given a run of a local-only workspace failed because Sorter uses a cloud model, when the run page's **Choose a local model for Sorter** opens Sorter at `model`, then Sorter's page shows Configuration › Model with the focus in the model picker.
- Given Sorter's page is open on Runs, when it is opened at `model` again, then it shows Configuration › Model with the focus in the picker.
- Given the person then picks Behaviour and Model again by hand, then the picker doesn't take the focus.
- Given the person then goes to Runs and back to Configuration by hand, then Configuration opens on Behaviour and the picker doesn't take the focus.
- Given Sorter is opened from the Agents list, then the page opens on Configuration › Behaviour and the picker doesn't take the focus.
