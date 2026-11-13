# google-setup.step-bodies

- Status: active
- Since: 0.1.0
- Source: HAL-712; google-setup-flow (HAL-621) sections 3.1 and 3.2; ux-checklists (HAL-1019) sections 2.2, 2.3 and 8 point 2

The Google setup view shall show, in each open step from 1 to 5, the actions to take in Google, the links and the values to copy that the step generator made, and nothing it didn't. Each Console link shall name its page and open in the system browser. Each value the user types into Google shall have **Copy**; the client secret shall never have one. Step 1 shall have a "Project ID" field and save a valid ID with **Done, next**, refuse an invalid one with the reason, and clear it when emptied. Step 2 shall list one row per API with its name, address, the services that need it and its own **Enable**, and, with two APIs or more, **Switch on all** above them. Step 3 shall show "External" or "Internal"; for External it shall also show the required tick "The status says "In production"", and **Done, next** shall be `aria-disabled` with "Tick 'In production' to go on." until it is ticked; for Internal it shall show the help "Internal isn't available?" with a way to edit step 1. Step 4 shall list each scope with its reasons and a **Restricted** word where the step says so, and **Copy all scopes**. Step 5 shall warn that Google shows the secret only once before its actions, and shall have no **Done, next**.

## Examples

- Given the open step 2 with two APIs,
  when it shows,
  then there are two rows each with **Enable**, and **Switch on all** above them.
- Given the open step 1 and "Halonic X" typed as the project ID,
  when you choose **Done, next**,
  then nothing is saved and the field says what a project ID looks like.
- Given the open step 1 and "halonic-x1" typed,
  when you choose **Done, next**,
  then "project-id" and then "step-done" are saved.
- Given the open step 3 of a personal account without the tick,
  when you choose **Done, next**,
  then nothing is saved and "Tick 'In production' to go on." is its reason.
- Given that tick set,
  when you choose **Done, next**,
  then "step-done" is saved for the consent step.
