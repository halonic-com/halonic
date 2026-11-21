# Decision: the arrows card says when an arrow is never taken, and names steps as the canvas does

- Approval: HAL-15202, from Iris's flow check C548 (findings 1 and 4) on the board-approved docked step card (flow-workflows 5.3); a small change on an approved screen, decided by the team and written on the task; Sofia confirmed the wording on HAL-15220
- Kind: user-visible

The requirement workflows.page.step-arrows gains two things, and one existing rule narrows; workflows.page.step-card gains an example:

- A row whose arrow can never be taken (an earlier arrow on the same event has no condition, the core's `unguarded-shadow` check) says "△ Never taken: arrow <m> always matches first" under its words. Move and Add add "Arrow <k> is never taken: arrow <m> always matches first." to what they announce when they leave one, and Add expands the new row to its fields then, so its condition is one step away. Add still puts the new arrow last: putting a new arrow without a condition before the last one would only make the old one never taken instead.
- The section names steps as their cards on the canvas do (title, else id; the id in brackets after a shared title), in its rows, Go to…, its announcements and Arrows in.
- A step opened from Arrows in gets the docked card's title as main already gives it (its title, else its id, HAL-15120); a new example checks that.
- Go to… no longer offers the step itself (an arrow back to it on done would run it for ever); an arrow's own To still does.

Two existing examples now expect the longer announcements, because their `sort` fixture ends with an arrow that has no condition, which is the case the finding is about. No test runs fewer times or checks less.

## Covers

- workflows.page.step-arrows
- workflows.page.step-card
