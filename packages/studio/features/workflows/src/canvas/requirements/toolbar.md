# workflows.canvas.toolbar

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b PR 2); UX checklist 10.4 (toolbar, Auto layout), 10.8 (+ Step, + Wait); flow-workflows 3.2, 4.2, 5.3; C285 TB1 (HAL-14002); C361 WF1, WF2 (HAL-14396)

When the host can add steps, the workflows feature shall show a toolbar at the top left of the canvas on desktop, named "Flow tools": **Step**, **Wait**, a divider that stays visible in forced colours, then **Auto layout**, each keeping its text; a screen reader shall hear **Step** and **Wait** as "Add step" and "Add wait". **Step** and **Wait** shall ask the host to add an agent step or a wait step to the right of the right-most card, level with it, on the 20px grid, and select the new step once it shows; where its card docks, the card opens with its title focused and the canvas pans the new step into view beside it, as for a picked step. **Auto layout** shall ask the host to forget the places the person gave the steps and fit the canvas once they have moved; with no places saved it only fits. When the host can't change the workflow, a danger toast shall say "Couldn't change <workflow>" and why. A fit leaves the toolbar's row free. Where the host can't add steps, and on a phone, there is no toolbar.

## Examples

- Given Support reply, then the canvas's top left has Step, Wait and Auto layout, heard as "Add step", "Add wait" and "Auto layout", and in high contrast the divider shows in the text's colour.
- Given cards ending at x 448 with the right-most one at y 133, when Step is pressed, then the new step goes at (500, 140), and once it shows it is selected.
- Given Support reply at 200 % on a host that can change steps, when Wait is pressed, then once `wait-2` shows its card opens with "Step wait-2" focused, and the canvas pans until `wait-2` shows whole, left of the card.
- Given a step `done` the person moved, when Auto layout is pressed, then the host forgets the places; with no places saved, the host isn't asked.
- Given the host can't change the file, when Step is pressed, then a danger toast says "Couldn't change Support reply" and why.
- Given a host that can't add steps, or a phone, then the canvas has no toolbar.
