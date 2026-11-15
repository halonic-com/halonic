# workflows.canvas.fit-and-zoom

- Status: draft
- Since: 0.1.0
- Source: HAL-9865 (T7 PR 3); flow-workflows 4.7; states C8, D9

When the canvas is opened or **Auto layout** is pressed, the workflows feature shall fit all steps in the viewport without zooming in past 100 %, and when the person zooms, the canvas shall keep the point under the pointer where it is and stay between 25 % and 200 %.

## Examples

- Given three cards that fit in the viewport, then the fit leaves the zoom at 100 % and centres them.
- Given cards twice as wide as the viewport, then the fit zooms out until they all show, with 32 pixels of room round them.
- Given one card, then the fit doesn't blow it up past 100 %.
- Given no steps, then the view is 100 % at the top left.
- Given the pointer is over a card and the person zooms in, then that card stays under the pointer.
- Given the person zooms out again and again, then the zoom stops at 25 %.
