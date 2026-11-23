# first-run.served-models

- Status: active
- Since: unreleased
- Source: HAL-16637 (HAL-14808 PR 4b); HAL-16248 (option A, a Settings › Models row; the trust line's wording), decided by the team under HAL-2282

Where Studio is served by `halonic serve`, Settings shall have a workspace section **Models** with one **Model** row that names the model the workspace's `default` alias uses, the way the Pick a model screen names its options ("Sample answers" for the test model, a model on this computer by its model name, a cloud provider by its name, nothing when there is none), and a **Pick a model** button.

When **Pick a model** is pressed, the section shall show the Pick a model screen in its place, unchanged (`first-run.pick-model`), on the computer's model choice. When **Back** is pressed, or Sample answers is continued, the section shall show the Model row again with nothing changed. When Continue saves a choice, the section shall show the Model row naming the model the computer now uses, and, if the computer doesn't trust the workspace after the save, the line "Saved. Trust this workspace on your computer before your next run." A served Continue shall never grant trust.

Rationale: a served window has no Runs, so Settings is where a second device changes the model; trust stays a step at the computer (HAL-14808, D2), so the line says where to give it.

## Examples

- Given Acme on the test model, then the Model row reads "Sample answers".
- Given a key for Anthropic is tested and saved, and the computer doesn't trust the workspace now, then the row reads "Anthropic" and the line under it reads "Saved. Trust this workspace on your computer before your next run."
