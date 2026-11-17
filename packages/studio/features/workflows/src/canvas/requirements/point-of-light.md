# workflows.canvas.point-of-light

- Status: draft
- Since: unreleased
- Source: HAL-8419; Noah's spec on HAL-8428; board decision 13 Nov (HAL-8416)

When the active step of a run changes, the workflows feature shall move the point of light from the old step's status dot to the new one's on one quadratic curve that bows to the left of the direction of travel, taking 700 to 1100 ms on a spring that runs about 4 % past the end and settles back and ends exactly on the target with no snap on a hop of any length, with no tail.

## Examples

- Given a hop from (0, 0) to (100, 0), then the control point is 36 % of the distance above the midpoint, so the curve bows up by 18 % of the distance.
- Given a hop from (0, 0) to (0, 100), then the curve bows to the right.
- Given a hop of 120 px, then it takes 800 ms; of 20 px, 700 ms; of 300 px, 1100 ms.
- Given a hop, then the light starts at the first dot, goes 3.5 to 4.5 % past the second, and is exactly on it at the end.

## Notes

This covers the curve, the time and the spring. Drawing the light, its rest, the hand-off and reduced motion are in `workflows.canvas.point-of-light-rest`.
