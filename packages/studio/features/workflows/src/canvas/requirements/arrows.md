# workflows.canvas.arrows

- Status: draft
- Since: 0.1.0
- Source: HAL-9865 (T7 PR 3); flow-workflows 4.1, 4.3

When the canvas draws an arrow between two steps, the workflows feature shall draw it from the bottom edge of the first card to the top edge of the second when the second is below, and otherwise round the right side of both cards, so no arrow runs through a card.

## Examples

- Given `done` below `start`, then the arrow leaves the middle of start's bottom edge and its head points down at the middle of done's top edge.
- Given an arrow from a step to one above it, then it loops out on the right of both cards and its head points left.
- Given an arrow from a step to itself, then it loops out on that card's right side, with a visible curve.
- Given an arrow, then its label sits halfway along it.
