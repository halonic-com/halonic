# workflows.canvas.arrows

- Status: draft
- Since: unreleased
- Source: HAL-9865 (T7 PR 3); flow-workflows 4.1, 4.3

When the canvas draws an arrow between two steps, the workflows feature shall draw it from the bottom edge of the first card to the top edge of the second when the second is below, side to side when the two share a row, and otherwise round the right side of both cards, so no arrow runs through either card it joins.

## Examples

- Given `done` below `start`, then the arrow leaves the middle of start's bottom edge and its head points down at the middle of done's top edge.
- Given two cards in the same row, then the arrow runs from the facing edges, and its head points right when the second is to the right and left when it is to the left.
- Given an arrow from a step to one above it, then it loops out on the right of both cards and its head points left.
- Given an arrow from a step to itself, then it loops out on that card's right side, with a visible curve.
- Given an arrow, then its label sits halfway along it.

## Notes

The requirement covers only the two cards an arrow joins. Routing round other cards in between (for example a back-up arrow whose loop passes a card in the next column) is not done yet.
