# agents.configuration.where-it-runs

- Status: draft
- Since: unreleased
- Source: HAL-4295, HAL-1709 (ux-checklists-sandbox 3.8, Julian's conditions from HAL-1673, his review on HAL-13201); microcopy 8.5 and 23.4 (placeholders until HAL-1784)

The agents feature shall give the Harness page a Where it runs choice, In a sandbox or On this computer, read from the host for this computer. Choosing the sandbox shall save at once. Choosing On this computer shall open the warning, with Cancel focused and **Run on this computer** as the danger button, and save nothing until the person confirms; it shall save for the fingerprint of the file the warning was opened for, and when the file changed since, keep the warning open for the file as it is now and say that nothing was saved. When the agent's file changed after the choice, the page shall keep On this computer picked and show the confirm-again Callout with **Review and confirm**, which opens the same warning. While the agent's file has unsaved changes, the warning shall say the choice is for the saved file and keep **Run on this computer** unavailable until it is saved. Where Studio can't choose, the page shall not draw the choice; when it can't read it, it shall say why and offer **Try again**.

## Examples

- Given an agent nobody chose for, then In a sandbox is picked.
- Given the person picks On this computer, then the warning opens with Cancel focused and nothing is saved; Cancel leaves In a sandbox picked.
- Given the person confirms the warning, then On this computer is picked and saved.
- Given an agent set to On this computer, when its file is saved with a change, then On this computer stays picked and the Callout asks to confirm again; **Review and confirm** opens the warning, and confirming clears the Callout.
- Given the file changes while the warning is open, when the person confirms, then nothing is saved, the warning stays open and says so, and confirming again saves for the new file.
- Given an agent on this computer, when the person picks In a sandbox, then it is saved without a warning.
- Given the agent's file has unsaved changes, when the person picks On this computer, then the warning asks to save first and **Run on this computer** saves nothing.
- Given a Studio that can't choose where agents run, then Where it runs isn't drawn.
- Given the choice can't be read, then the page says why; **Try again** reads it again.
