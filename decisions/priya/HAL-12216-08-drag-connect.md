# Decision: changing a field of an arrow is refused when the arrow no longer goes where the card showed it

- Task: HAL-12216
- Approval: suggested by Liam in his review of #4488 on HAL-12216 (21 Nov, "carry the arrow's `to` on `set`, the way a move does"); Liam approves this note in review
- Kind: internal

## What changes

- `studio.workspace-workflow-arrow-fields`: a change of one field of an arrow now carries where the arrow goes as the step card showed it, the same as a move does. The desktop app refuses the change, writes nothing and says "This step's arrows changed in the meantime. Look at them again, then change the arrow." when the arrow at that place in the file no longer goes there. One sentence and one example are added.

Nothing is removed or weakened: every change the requirement accepted before is still accepted when the card is up to date, and every refusal it named stays.

## Why

An arrow's change found the arrow only by its place in the step's list. When the file changed under an open card (in the YAML, in another window, or by an undo), the card's place could point at another arrow, and the change would land there. A move already checks the arrow's target for this reason; a field change now does too.

## Covers

- studio.workspace-workflow-arrow-fields
