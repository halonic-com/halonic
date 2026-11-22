# agents.configuration.where-it-runs

- Status: draft
- Since: unreleased
- Source: HAL-4295, HAL-1709 (ux-checklists-sandbox 3.8, Julian's conditions from HAL-1673, his review on HAL-13201, Liam's conditions on HAL-13194, Sofia's words on HAL-13232, words check C553 on HAL-15226, words check C571 on HAL-15403); microcopy 8.5 and 23.4 (approved on HAL-1784); microcopy 22 F13 and rule E3 for a reason Halonic can't explain

The agents feature shall give the Harness page a Where it runs choice, In a sandbox or On this computer, read from the host for this computer. Choosing the sandbox shall save at once. Choosing On this computer shall open the warning, with Cancel focused and **Run on this computer** as the danger button, and save nothing until the person confirms; it shall save for the fingerprint of the file the warning was opened for, and when the file changed since, keep the warning open for the file as it is now and say that nothing was saved. When the agent's file changed after the choice, the page shall keep On this computer picked and show the confirm-again Callout with **Review and confirm**, which opens the same warning, starting with a line that says the agent's file changed and, where the app can open Changes, **See what changed ›**, which closes the warning and opens Changes. While the agent's file has unsaved changes, the warning shall say the choice is for the saved file and keep **Run on this computer** unavailable until it is saved, with that line as the button's description. While the host reports that this Studio can't start an agent outside its sandbox, On this computer shall say so under its note. Where Studio can't choose, the page shall not draw the choice and shall say to choose in the desktop app instead; when it can't read it, it shall say why and offer **Try again**. When it can't read or save the choice because of an internal error, the reason shall be "Halonic ran into a problem it can't explain yet." and not the error's own text.

## Examples

- Given an agent nobody chose for, then In a sandbox is picked.
- Given the person picks On this computer, then the warning opens with Cancel focused and nothing is saved; Cancel leaves In a sandbox picked.
- Given the person confirms the warning, then On this computer is picked and saved.
- Given an agent set to On this computer, when its file is saved with a change, then On this computer stays picked and the Callout asks to confirm again; **Review and confirm** opens the warning, and confirming clears the Callout.
- Given a choice on hold, when the person presses **Review and confirm**, then the warning starts with the file changed line and **See what changed ›**; pressing it closes the warning, opens Changes and saves nothing.
- Given a choice on hold where the app can't open Changes, then the warning says the file changed with no link; given a first choice, the warning has no such line.
- Given the file changes while the warning is open, when the person confirms, then nothing is saved, the warning stays open and says so, and confirming again saves for the new file.
- Given an agent on this computer, when the person picks In a sandbox, then it is saved without a warning.
- Given the agent's file has unsaved changes, when the person picks On this computer, then the warning says to confirm once the changes are saved and **Run on this computer** saves nothing.
- Given the host reports that Studio can't start an agent outside its sandbox, then On this computer says so; given it can, then it doesn't.
- Given a Studio that can't choose where agents run, then Where it runs isn't drawn and the page says to choose in the desktop app.
- Given the choice can't be read, then the page says why; **Try again** reads it again.
- Given reading or saving the choice fails with an internal error, then the page says "Halonic ran into a problem it can't explain yet." and not the error's text.
