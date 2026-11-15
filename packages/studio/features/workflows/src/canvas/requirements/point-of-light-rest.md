# workflows.canvas.point-of-light-rest

- Status: draft
- Since: 0.1.0
- Source: HAL-8419; Noah's spec on HAL-8428 (rest, hand-off, reduced motion)

When the active step of a run is shown, the workflows feature shall draw one point of light on that step's status dot in the step's status colour, floating on a 2 px circle once every 7 s and breathing between 85 % and 130 % brightness over 3.6 s each way; when the active step changes while it is flying, it shall finish the hop and then go straight on to the newest step; and when the person prefers reduced motion, it shall draw one still dot that cross-fades to the new step's dot over 120 ms, with no flight, float or breath.

## Examples

- Given the light at rest, then it moves at most 2 px from the dot and its brightness stays between 85 % and 130 %.
- Given a hop under way and two more steps becoming active, then the light finishes the hop and flies once to the newest step, never to the one in between.
- Given reduced motion, then the old dot fades out and the new one in over 120 ms, and nothing travels.
- Given a hidden tab or a light off screen, then no frames are drawn, and on return the light rests on the step it was heading for.
- Given the light, then it takes no clicks, is hidden from assistive technology, and in forced colours is drawn in `Highlight` with no glow.

## Notes

Nothing is drawn on the canvas yet: the canvas has no run mode or status dots, so this component is not placed on it until they exist.
