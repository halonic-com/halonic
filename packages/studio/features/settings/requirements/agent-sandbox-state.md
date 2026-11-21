# settings.agent-sandbox-state

- Status: active
- Since: unreleased
- Source: HAL-1451 (S1); ux-checklists-s1-s2 1.2 to 1.6 (HAL-1444); flow-install-update 13 (HAL-1151); HAL-11626 (C446-2 of the design check on HAL-14656: a check's internal error in the warning Callout)

The Studio shall decide what Settings › Agent sandbox shows from the host's check, what runs now and how the last setup or removal ended. It shall show the chip **Needs setting up** with **Set up the sandbox**, **Needs repair** with **Repair the sandbox**, **Ready** with **Check again** and **Remove the sandbox…**, and **Setting up** with a busy button and the steps while one runs. A failed setup shall show a Callout with the reason as a sentence and **Try again**: for a refused administrator prompt, for a failure, for a failed check (the state then reads Needs repair) and for a setup that took 5 minutes without ending, which Studio shall not stop. A repair that takes 5 minutes shall say so in the words of a repair. When **Try again** finds the helper of an earlier press still running, the section shall show a note, not a failure, that the earlier setup (or repair) is still running, with **Try again**. A removal that fails shall say why with no **Try again**, and while sandboxed runs go on it shall say how many runs use the sandbox, in the plural when there are several. A build without the sandbox shall show Not available and no button. A check that ran and found the sandbox can't run shall show the chip **Not available**, the reason and its fix from the sandbox-start catalogue (no fix where the section's own set-up button is the fix, and the fix for doing it on the computer in served Studio), **Check again**, the guide's link and "You can run an agent on this computer after a warning."; it shall never show the check's own sentence, and a reason it doesn't know reads as `other`. A check that couldn't run shall read "Couldn't check the sandbox: …"; when it hit an internal error, that line shall be in the same warning Callout with **Copy details** that a failed setup or removal uses, or, while a setup or removal Callout shows, stay under the chip with **Copy details** next to **Check again**. Served Studio shall show the state and **Check again** only, with "View only here." Nothing in this state shall start a setup.

## Examples

- Given the check says the sandbox isn't set up,
  when the section shows,
  then the chip reads "Needs setting up", the button "Set up the sandbox", and under it "Windows asks for administrator rights once."
- Given a setup has run for 5 minutes,
  when the time limit is checked,
  then the Callout reads "The sandbox isn't set up: the setup didn't finish within 5 minutes." with **Try again**.
- Given a repair has run for 5 minutes,
  when the time limit is checked,
  then the Callout reads "The sandbox isn't repaired: the repair didn't finish within 5 minutes."
- Given the person pressed **Try again** after a repair while the earlier helper still runs,
  when the section shows,
  then an info Callout reads "The earlier repair is still running. Wait a minute, then try again." with **Try again**, and after a setup "The earlier setup is still running. Wait a minute, then try again."
- Given the check ran and found bubblewrap missing,
  when the section shows,
  then it shows **Not available**, "bubblewrap isn't installed, and the sandbox needs it." with its fix, **Check again**, the link "How to install bubblewrap" and "You can run an agent on this computer after a warning."; and given the check itself failed, it reads "Couldn't check the sandbox: …" with the reason.
- Given the check found `other`,
  when the section shows,
  then it reads "Halonic can't tell what the sandbox is missing." and not the check's own sentence.
- Given a removal while 3 runs use the sandbox,
  when the section shows,
  then the Callout reads "The sandbox wasn't removed: 3 runs are using it. Stop them or let them finish, then try again."
- Given a removal while 1 run uses the sandbox,
  when the section shows,
  then the Callout reads "The sandbox wasn't removed: 1 run is using it. Stop it or let it finish, then try again."
