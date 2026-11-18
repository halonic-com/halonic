# workflows.canvas.status-dots

- Status: draft
- Since: unreleased
- Source: HAL-11974; HAL-8419; Noah's spec on HAL-8428; HAL-12946 (the mark)

When a run is shown, the workflows feature shall draw a status dot at the top-right of each step card the run reached, in the colour of how that step stands (done teal, running blue, waiting violet, failed rose, stopped grey) and carrying that state's mark (✓, the live dot, ‖, ×, the square), with an edge that still draws it in high contrast and the same state as hidden text for assistive technology, and shall place the point of light on the dot of the step the run is in, in the dot's colour, and nowhere once the run has ended.

## Examples

- Given a run that went through "start" and "write" and is running, then "start" has a teal dot with ✓, "write" has a blue dot with the point of light on it, and the other steps have none.
- Given a failed run that ended in "write", then "write" has a rose dot with × and no point of light is drawn.
- Given a run that is waiting for the person in "review", then the light rests on a violet dot.
- Given no run shown, then no step has a dot and there is no light.
