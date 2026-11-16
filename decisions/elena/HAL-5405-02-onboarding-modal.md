# Decision: a recommended sandbox that can't run is not the recommended card

- Approval: the screens and wording are the board-approved plan and final wording (HAL-3777); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-5405 (PR 2, the onboarding modal shell)

## What changes

`settings.sandbox-choice-view` now leaves a recommended backend that can't run out of the recommended card and drops its **Recommended** badge. The first screen then shows no card for it, and Other options lists it as unavailable with its reason. Before, the first screen showed it with a working **Set up** button and no reason. Nothing was removed or weakened. The new modal itself (`settings.sandbox-choice-flow`) is not mounted yet.

## Why

On Windows with virtualisation off, Sandbox in WSL is the recommended backend but can't run. Offering **Set up** for it sends a person into a setup that cannot succeed.

## Decided by the team

- When the computer couldn't be checked, the first screen says "We couldn't check this computer." and has no **Other options** button, because there is nothing to list. This drops "Pick an option below." from the plan's sentence (Sofia can change it in review).
- "Pick a sandbox first." is the new text for pressing Set up with nothing picked.
- The small-window rule (card up to 90% high) applies to windows under 560 px high, not narrow ones.

## Covers

- settings.sandbox-choice-view
