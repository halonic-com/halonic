# settings.agent-sandbox-state

- Status: active
- Since: 0.1.0
- Source: HAL-1451 (S1); ux-checklists-s1-s2 1.2 to 1.6 (HAL-1444); flow-install-update 13 (HAL-1151)

The Studio shall decide what Settings › Agent sandbox shows from the host's check, what runs now and how the last setup or removal ended. It shall show the chip **Needs setting up** with **Set up the sandbox**, **Needs repair** with **Repair the sandbox**, **Ready** with **Check again** and **Remove the sandbox…**, and **Setting up** with a busy button and the steps while one runs. A failed setup shall show a Callout with the reason as a sentence and **Try again**: for a refused administrator prompt, for a failure, for a failed check (the state then reads Needs repair) and for a setup that took 3 minutes without ending, which Studio shall not stop. A repair that takes 3 minutes shall say so in the words of a repair. A removal that fails shall say why with no **Try again**, and while sandboxed runs go on it shall say how many runs use the sandbox, in the plural when there are several. A build without the sandbox shall show Not available and no button. A check that ran and found the sandbox can't run shall read "The sandbox isn't ready: …"; a check that couldn't run shall read "Couldn't check the sandbox: …". Served Studio shall show the state and **Check again** only, with "View only here." Nothing in this state shall start a setup.

## Examples

- Given the check says the sandbox isn't set up,
  when the section shows,
  then the chip reads "Needs setting up", the button "Set up the sandbox", and under it "Windows asks for administrator rights once."
- Given a setup has run for 3 minutes,
  when the time limit is checked,
  then the Callout reads "The sandbox isn't set up: the setup didn't finish within 3 minutes." with **Try again**.
- Given a repair has run for 3 minutes,
  when the time limit is checked,
  then the Callout reads "The sandbox isn't repaired: the repair didn't finish within 3 minutes."
- Given the check ran and found bubblewrap missing,
  when the section shows,
  then it reads "The sandbox isn't ready: bubblewrap isn't installed."; and given the check itself failed, it reads "Couldn't check the sandbox: …" with the reason.
- Given a removal while 3 runs use the sandbox,
  when the section shows,
  then the Callout reads "The sandbox wasn't removed: 3 runs are using it. Stop them or let them finish, then try again."
- Given a removal while 1 run uses the sandbox,
  when the section shows,
  then the Callout reads "The sandbox wasn't removed: 1 run is using it. Stop it or let it finish, then try again."
