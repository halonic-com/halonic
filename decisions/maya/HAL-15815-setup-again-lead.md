# Decision: a sandbox setup from an older release says so in the lead (C633)

- Task: HAL-15815 (words check C633, HAL-15802)
- Approval: team wording on an approved screen (HAL-2282); Noah's sentence from HAL-14804 stays word for word; Liam signs this note
- Kind: user-visible

## What changes

Settings › Agent sandbox, a setup from an older release (`setupAgain`, #4292, C633 row 14). As built, the lead said
"The sandbox needs a one-time setup with administrator rights." and the line under **Set up the sandbox** said "This
version of Halonic needs the sandbox set up again. Windows asks for administrator rights once." So "one-time setup"
and "set up again" sat one line apart, and "administrator rights" was said twice.

With `setupAgain` only:

- the lead is "This version of Halonic needs the sandbox set up again, with administrator rights. Until then, agents
  set to run in a sandbox don't start.";
- the line under **Set up the sandbox** is the usual "Windows asks for administrator rights once.".

Noah's sentence moves up to the lead, where the state is said. Without `setupAgain`, nothing changes. The chip and
the button stay the same. The words screen readers hear after a setup or a removal follow the lead, as before.

No test was weakened or skipped: the test now checks both the lead and the line under the button, for both cases.

## Covers

- settings.agent-sandbox-setup-again
