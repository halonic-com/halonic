# google-setup.checklist

- Status: active
- Since: 0.1.0
- Source: HAL-712; google-setup-flow (HAL-621) section 3.1; ux-checklists (HAL-1019) sections 2.2 and 8 points 2 and 5

The Google setup view shall list the generated steps as a numbered list, counting them from the generated steps alone. A finished step shall be one line with its title, its value and **Edit**. The first step not done shall be open, its list item marked `aria-current="step"`, with its title (a heading, read as "Step 3 of 7, current"), one sentence on why, **Not now** and **Done, next**; later steps shall show only their titles. A step that finishes by itself (steps 5 to 7) shall have no **Done, next**. When the item opens, the open step's title shall take focus. **Done, next** shall save the step as done, open the next step and move focus to its title. **Edit** shall open a finished step and move focus to its title. When saving a step fails, the step shall say "Couldn't save your progress: *reason*." (the host's message after the colon, with no closing full stop; a name in it keeps its capital) in a Callout that takes focus, with **Try again** that saves again. While the engine isn't answering, **Done, next** shall be `aria-disabled` with the reason as visible text, and a step with no **Done, next** shall show no reason. When the account can't be read, or the host no longer lists it, the view shall say "Couldn't load the Google setup" with the reason ("This Google account isn't set up here any more." for an account not listed) and **Try again**, and not stay on its loading state. **Not now** shall close the item.

## Examples

- Given the host can't save the step because "The disk is full.",
  when you choose **Done, next**,
  then the step says "Couldn't save your progress: the disk is full." with focus on it, and **Try again** saves it again.
- Given an account that finished steps 1 and 2,
  when the item opens,
  then steps 1 and 2 are one line each with **Edit**, step 3 is open with "Step 3 of 7, current" and has focus, and steps 4 to 7 show only their titles.
- Given the open step 3,
  when you choose **Done, next**,
  then "step-done" is saved for the consent step.
- Given the open step 3,
  when the host says the account changed and step 3 is done,
  then step 4 is open and its title has focus.
- Given a finished step 1,
  when you choose **Edit**,
  then step 1 opens with its title in focus and **Done, next**.
- Given step 5 is open,
  when the checklist shows,
  then it has **Not now** and no **Done, next**.
- Given the engine isn't answering,
  when you choose **Done, next**,
  then nothing is saved, the button is `aria-disabled` and its reason is shown.
- Given the accounts can't be read,
  when the view opens,
  then it says "Couldn't load the Google setup" with **Try again**, and reads again when you choose it.
- Given the host doesn't list the account,
  when the view opens,
  then it says "This Google account isn't set up here any more."
- Given the open step,
  when you choose **Not now**,
  then the item closes.
