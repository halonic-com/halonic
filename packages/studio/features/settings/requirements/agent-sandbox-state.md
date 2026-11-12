# settings.agent-sandbox-state

- Status: active
- Since: 0.1.0
- Source: HAL-1451 (S1); ux-checklists-s1-s2 1.2 to 1.6 (HAL-1444); flow-install-update 13 (HAL-1151)

The Studio shall decide what Settings › Agent sandbox shows from the host's check, what runs now and how the last setup or removal ended. It shall show the chip **Needs setting up** with **Set up the sandbox**, **Needs repair** with **Repair the sandbox**, **Ready** with **Check again** and **Remove the sandbox…**, and **Setting up** with a busy button and the steps while one runs. A failed setup shall show a Callout with the reason as a sentence and **Try again**: for a refused administrator prompt, for a failure, for a failed check (the state then reads Needs repair) and for a setup that took 3 minutes without ending, which Studio shall not stop. A removal that fails shall say why with no **Try again**, and while sandboxed runs go on it shall say how many runs use the sandbox. A build without the sandbox shall show Not available and no button. Served Studio shall show the state and **Check again** only, with "View only here." Nothing in this state shall start a setup.

## Examples

- Given the check says the sandbox isn't set up,
  when the section shows,
  then the chip reads "Needs setting up", the button "Set up the sandbox", and under it "Windows asks for administrator rights once."
- Given a setup has run for 3 minutes,
  when the time limit is checked,
  then the Callout reads "The sandbox isn't set up: the setup didn't finish within 3 minutes." with **Try again**.
- Given a removal while 1 run uses the sandbox,
  when the section shows,
  then the Callout reads "The sandbox wasn't removed: 1 run is using it. Stop it or let it finish, then try again."
