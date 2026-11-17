# library.skill-page

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P5b); flow-library 5.1; `library.skills.save-on-leave`, `library.skills.empty-name-kept`, `library.skills.keep-extra-header-fields` (HAL-119)

When a skill opens, its page shall show the skill's Name, "When to use it" (with the permanent hint "Agents read this to decide when to use the skill."), Instructions, the other header fields as `key: value` with "Kept as they are. Edit them in the file." (only when there are any), the other files of the skill's folder (only when there are any), and "Used by" with the agents that use it, or "No agent uses this skill yet. Add it under an agent's Tools." when none does. When a field is left, the page shall save it as one change through the skill host, and a field left unchanged shall write nothing. If Name or "When to use it" is left empty, then the page shall write nothing, put the old value back and show "A skill needs a name, so the old one is kept." or "A skill needs “When to use it”, so the old text is kept." until the next edit of that field. If a save fails, then the page shall keep the draft and say so through the window's save state (the status bar's "Couldn't save · Try again" and the toast "Couldn't save *name*: *reason*." with **Try again**, microcopy 2), with no box of its own on the page. If the host has no such skill, then the page shall say "This skill isn't in this workspace any more." with **Go to Library**.

## Examples

- Given a skill "Refunds" with `license: MIT` in its header,
  when its page opens,
  then it shows "Also in the header" with `license: MIT`.
- Given the name field changed to "Acme refunds",
  when the field is left,
  then the host writes the file once, with only the name changed.
- Given the name field cleared,
  when the field is left,
  then nothing is written, the field shows "Refunds" and the hint says the old name is kept.
- Given the hint under a cleared name,
  when the person types in the field again,
  then the hint is gone.
- Given a skill nobody uses,
  when its page opens,
  then "Used by" says "No agent uses this skill yet. Add it under an agent's Tools."
- Given a skill the host doesn't have,
  when its page opens,
  then it says "This skill isn't in this workspace any more."
- Given a save that fails,
  when the field is left,
  then the field keeps the typed text and the window's save state says it couldn't save, with **Try again**; the page has no box.
- Given that failure,
  when **Try again** is run and the save works,
  then the host writes the file.
