# settings.agent-sandbox-section

- Status: active
- Since: 0.1.0
- Source: HAL-8034 (S1 part 2, HAL-1451); ux-checklists-s1-s2 1.2 to 1.6 (HAL-1444); flow-install-update 13 (HAL-1151)

The Settings window shall list **Agent sandbox** under the host sections and draw the state `settings.agent-sandbox-state` decides: chip, words, steps, the failure Callout and the buttons. The section shall ask the agent host for its check when it opens and start a setup, repair or removal only when the person presses its button. **Remove the sandbox…** shall open a dialog titled "Remove the agent sandbox?" and remove nothing until **Remove sandbox** is pressed; **Cancel** closes it. A setup that has run for 3 minutes without ending shall show its Callout with **Try again** and shall not be stopped. After a setup the section shall check again, and a check that doesn't pass shall read Needs repair. Without an agent host the section shall read Not available and show no button.

## Examples

- Given the check says the sandbox isn't set up,
  when the section opens,
  then nothing starts and **Set up the sandbox** shows.
- Given the person presses **Remove the sandbox…** and then **Cancel**,
  when the dialog closes,
  then the host was not asked to remove anything.
- Given a setup has run for 3 minutes,
  when the time limit passes,
  then the Callout reads "The sandbox isn't set up: the setup didn't finish within 3 minutes." with **Try again**, and the host's setup is still running.
