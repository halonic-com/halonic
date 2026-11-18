# workflows.canvas.point-of-light-rest

- Status: draft
- Since: unreleased
- Source: HAL-8419; Noah's spec on HAL-8428 (rest, hand-off, reduced motion)

When the active step of a run is shown, the workflows feature shall draw one point of light on that step's status dot in the step's status colour, with a core that covers the dot, floating on a 1 px circle once every 7 s, so the dot never shows past the core, and breathing the glow's opacity between 55 % and 100 % over 3.6 s each way, the core always being the dot's own colour, both eased in over the first 800 ms after it lands; when the active step changes while it is flying, it shall finish the hop and then go straight on to the newest step; and when the person prefers reduced motion, it shall draw one still dot, centred with its glow at 80 %, that cross-fades to the new step's dot over 120 ms, with no flight, float or breath.

## Examples

- Given a light that has just landed, then it is on its dot with the glow at full opacity, and over the next 800 ms the float grows to 1 px and the glow opacity eases into the breath, with no jump.
- Given the light at rest for more than 800 ms, then it moves at most 1 px from the dot, its 12 px core still covers the 10 px dot and keeps the dot's colour, and its glow opacity stays between 55 % and 100 %.
- Given a hop under way and two more steps becoming active, then the light finishes the hop and flies once to the newest step, never to the one in between.
- Given reduced motion, then the old dot fades out and the new one in over 120 ms, and nothing travels.
- Given a hidden tab or a light off screen, then no frames are drawn, and on return the light rests on the step it was heading for.
- Given the light, then it takes no clicks, is hidden from assistive technology, and in forced colours is drawn in `Highlight` with no glow.

## Notes

The canvas places the light on the active step's dot (`workflows.canvas.status-dots`).
