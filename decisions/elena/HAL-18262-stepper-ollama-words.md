# Decision: the first-run Ollama hint names the Check again button

- Approval: HAL-18262, row W2 of Sofia's words check on HAL-18261, a small wording fix on an approved screen that the team decides (HAL-2282); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-18262

## What changes

`first-run.pick-model-described`: the example for a ticked local option with no Ollama found said "Start Ollama, then check again." It now says "Start Ollama, then press Check again." The statement itself is unchanged.

## Why

The button is **Check again**, and the pull hint right next to it already says "then press Check again". The line now names the button the same way.

## Covers

- first-run.pick-model-described
