# Decision: Studio isolates a plugin's names, titles and descriptions in bdi

- Task: HAL-12345 (finding L5 of the P10 security review, HAL-1743)
- Approval: the task asks for this change; Liam approves this note in review on HAL-12345
- Kind: user-visible

## What changes

`plugins.plugin-text` gains one sentence and one example: where Studio draws a plugin's name, its description, a tool's description or the title of a command, card or panel as text of its own, that text is in `<bdi>`. A new `Quoted` keeps the quotes outside it. No wording, layout or style changes; only where punctuation sits around right-to-left text does.

## Why

Without isolation, right-to-left text in a plugin's name or title can reorder the quotes and words around it. Studio already draws results this way.

Text the kit takes as a plain string (list row titles, dialog titles such as "Trust Weather?", toasts) isn't wrapped here: that needs kit changes, and with `format.plugin-file` refusing hidden marks (HAL-12345 #3562), what's left there is only where punctuation sits around a genuine right-to-left name.

## Tests

No test was removed or weakened. `quoted.test.tsx` adds tests for the new example.

## Covers

- plugins.plugin-text
