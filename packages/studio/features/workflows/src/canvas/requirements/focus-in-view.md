# workflows.canvas.focus-in-view

- Status: draft
- Since: unreleased
- Source: HAL-12620; Sofia's keyboard and screen-reader check on HAL-12584, row E2 (WCAG 2.4.11, 2.1.1)

When a step card gets keyboard focus while part of it is out of the canvas's view, the workflows feature shall pan the canvas just enough that the whole card, its Start chip included, shows inside the canvas, 16 pixels clear of its edges and clear of the strip at the left edge where the zoom buttons sit, keeping the zoom; it shall not pan for a card that already shows, nor for a card the person clicks (once a click has docked the step's card, `workflows.page.step-card` pans it clear), and the canvas box itself shall never scroll.

## Examples

- Given the canvas at 200 % with the first card above the view, when the person tabs to it, then the whole card and its Start chip show, and the canvas box's `scrollTop` stays 0.
- Given a card below the view, when it gets focus, then the canvas pans up until the card's bottom edge is 16 pixels above the canvas's.
- Given a card left of the view, when it gets focus, then it lands 16 pixels right of the zoom buttons' strip.
- Given a card that already shows, when it gets focus, then the zoom and pan stay as they were.
- Given a card bigger than the canvas, when it gets focus, then its top-left corner lines up 16 pixels in, so its kind and title show.
- Given the person clicks a card half out of view, then the canvas doesn't move under the pointer.

## Notes

The pan is instant, like every other pan and zoom on the canvas, so there's nothing to turn off for reduced motion.
