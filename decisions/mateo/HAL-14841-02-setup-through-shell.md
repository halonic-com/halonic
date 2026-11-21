# Decision: Settings › Agent sandbox says 5 minutes, and says when an earlier setup still runs

- Approval: HAL-14863 (Noah's wording decision of 21 Nov, on HAL-14841)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:THGHiu4JAx2RpzTZ8lZV1Or3VSIfOV/98yT2ddvRV68zkKDde1Z684tZxNP+JT4rVqgWzXW0qfN9FPet7THuCA==

Studio now asks Windows for the sandbox's administrator rights through the shell, which waits at most 5 minutes (HAL-14841, part 1). The section's own timer said 3 minutes, so a setup that Windows was still allowed to finish read as failed 2 minutes early. The section's limit now comes from one constant, `SETUP_LIMIT_MINUTES = 5`, next to a comment that points to the shell's limit, and the time-out lines say 5 minutes. Their pattern ("The sandbox isn't set up: the setup didn't finish within … minutes.") stays as approved.

A press of **Try again** while the helper of an earlier press still runs doesn't ask Windows again. The section says so in a note, not a failure: "The earlier setup is still running. Wait a minute, then try again." (or "repair" after a repair press). The words are Noah's (HAL-14863). The refused line, `DENIED`, doesn't change.

Only the minutes in the two requirements change, and `settings.agent-sandbox-state` gets the still-running note. No test is removed or weakened: the time-out tests now wait 5 minutes, and new tests cover the note.

## Covers

- settings.agent-sandbox-section
- settings.agent-sandbox-state
