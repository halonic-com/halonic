# Decision: the agent's Runs line ends in Open the Runs page ›

- Task: HAL-12934
- Approval: team decision under the HAL-2282 rule for small wording on approved screens (Sofia and Elena, HAL-12934, from the UX check on HAL-12915, row R2); Liam reviews the pull request on HAL-12934 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XNQI4AUpX33aeHEEAJJotV3p6Tw1fnx3jeJUA/JjUsHUMzcu6nHmC6NrFoQiRrVymxeYEKcPTWZDOKCRjXTyAQ==

## What changes

On the agent page's Runs tab, an agent no workflow runs said "Runs aren't listed by agent yet. See them on the Runs page." (HAL-12399 kept this line for that case), which names a place without a way to get there, while the Tools lines next to it end in **Open Library ›**. It now says "Runs aren't listed by agent yet. **Open the Runs page ›**", with **Open the Runs page ›** as the same inline link button as **Open Library ›**, opening the Runs page. Where the app can't open a place, the first sentence stands alone. It isn't "Open Runs ›", because the person is already on a tab called Runs.

The requirement `agents.page.frame` says so in its text, and its example for an agent no workflow runs changes its quoted line to match, with a new example for an app that can't open pages. The existing Runs tab test still checks the line the page shows, and now also that the button is absent without a way to open pages; a new test presses the button and checks that it opens the Runs page. The lines for an agent that workflows run are unchanged.

## Why

A line that sends someone somewhere should take them there, as the other lines on this page do. This is a small wording change on a screen the board already approved, so the team decides it (HAL-2282). Chief lists it under "Decided by the team".

## Covers

- agents.page.frame
