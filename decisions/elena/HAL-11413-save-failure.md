# Decision: say when a skill or knowledge source could not be saved

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11413 (the task) and Liam's review of #3272 on HAL-11427, which asks for these requirement edits. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

The skill and knowledge pages show "Couldn't save the skill" or "Couldn't save the knowledge source" with the reason and **Try again**
when a save fails. The draft stays until the next good save. Summarize says "Halonic on your computer isn't answering." when the host
can't be reached.

No test was weakened or skipped.

## Covers

- library.skill-page
- library.knowledge-page
- library.knowledge-summarize
