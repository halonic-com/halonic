# Decision: Settings › Assistant says first that there are no assistant chats yet

- Task: HAL-12400
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12400 (found in the usability walk-through HAL-12375, Stage C23; small wording of an approved screen, team decision, HAL-2282 rule; wording follows rule N1 of Sofia's UX check HAL-12363; Liam's code review)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7t0C3YORFG4tGZIU8IZEk/GjcdvYG6GBKP0yGWGNn195o6/LlMcNh0xLLB7Q8oYF0gII/rFPTAV5Ld5WiSc/AQ==

## What changes

The first line under Settings › Assistant (also what Ctrl K's **Assistant** opens) now reads:

- On the computer: "Halonic can't open assistant chats yet. These settings are kept for when it can, for every
  workspace on this computer. Never saved in a workspace."
- Served: the same, with "on the computer running Halonic".

It used to read "Used for new assistant chats in every workspace on this computer. Never saved in a workspace."
The section's controls, the Ctrl K action and the served and phone views are unchanged. The requirement's
wording changes to match. No test was weakened or skipped.

## Why

The walk-through found no Assistant anywhere in Studio: Ctrl K "assistant" opens only these settings, which
spoke of chats nobody can open (T14, HAL-1307, isn't built). Hiding the section and the action would be a flow
change for the board; one line keeps the settings and stops promising chats. It says "Halonic", not "Studio",
because the command line can't open assistant chats either (rule N1).

## Covers

- settings.ai-agent-section
