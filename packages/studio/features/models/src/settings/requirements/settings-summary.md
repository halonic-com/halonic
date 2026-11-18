# models.settings.settings-summary

- Status: draft
- Since: unreleased
- Source: flow-settings 1.1 (HAL-646); team decision on HAL-10289

The Models feature shall add the **Models** section to Settings, under the id `models` in the workspace group, with one line and the button **Open Models**. The line says what the workspace has: "3 aliases · 2 providers · budget €50.00 a month", with "1 alias" and "1 provider" in the singular. A budget says "a run" and "a month" for the amounts that are set, and is left out when none is set. With no providers the line is "No providers yet". While `models.yaml` or the `providers/` folder can't be read, the line is "Couldn't read the models settings." in place of a line with parts missing (that isn't "no providers"; states audit gap 5, HAL-11643). Nothing is shown until the files have been read. The same line is the section's summary in the phone's list. **Open Models** shall close Settings and then run the command `workspace.open-models`.

## Examples

- Given three aliases, two providers and `budget: { monthly: 50 }`, then the line is "3 aliases · 2 providers · budget €50.00 a month".
- Given one alias, one provider and no budget, then the line is "1 alias · 1 provider".
- Given no provider files, then the line is "No providers yet".
- Given `models.yaml` can't be read, then the line is "Couldn't read the models settings."
- Given the `providers/` folder can't be read, then the line is "Couldn't read the models settings."
- Given the user presses **Open Models**, then Settings closes and `workspace.open-models` runs.
