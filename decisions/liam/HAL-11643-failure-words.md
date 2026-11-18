# Decision: a failed Models save, a failed Models read and a failed Ctrl K command say so

- Approval: Liam decided this on HAL-11643, from the states audit on HAL-11635 (gap 5) and the board-approved microcopy 1.1; it applies approved words to existing screens, a team decision with no board card (HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:LM/susVHcuVwk9sZ7iyOvrp2qptlytmvD4qIhQESEA+DJnqGl/FFuVi35k54Imp6t3Xk1QiLCoEsGaIcExYXDQ==
- Task: HAL-11643

## What changes

The states audit found failures that showed no words. This change gives them the microcopy's
_Action failed_ shape (1.1):

- A budget, model alias or provider save whose file can't be read writes nothing and says
  "Couldn't save the budget: _reason_." (the model alias, the provider) with **Try again**, which
  makes the same save. Each requirement gains that sentence; no example is removed.
- Settings → Models said a line with the aliases or the providers left out while their files
  couldn't be read, which reads as fewer of them. It now says "Couldn't read the models
  settings." with **Open Models**. The two examples about the left-out parts are reworded to the
  new line.
- A Ctrl K command that fails with a reason that may pass, such as Halonic not answering, now
  offers **Try again** on its toast, which runs the command again. This is how "Check for Halonic
  updates" gets its Try again. One example is added.

`failureLine`, which builds the 1.1 sentence, moves from the Google setup feature to the shell so
the Models feature can use it too; its test moves with it, unchanged.

## Covers

- models.aliases.edit-target
- models.budget.budget-settings
- models.providers.edit
- models.settings.settings-summary
- shell.palette-wiring
- packages/studio/features/google-setup/src/ui/failure-line.test.ts
