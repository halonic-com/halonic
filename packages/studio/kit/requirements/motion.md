# kit.motion

- Status: active
- Since: unreleased
- Source: HAL-18555; design review HAL-18481 sections 3 and 4 (approved by the board on HAL-10, 25 Nov)

The kit shall offer four motion helpers that take their durations, curves and distances from the theme's tokens. `enter` shall fade an element in over `--duration-base` with `--ease-enter`, rising `--motion-rise` from below, dropping it from above, or without moving, as asked. `leave` shall fade an element out over `--duration-fast` with `--ease-exit`. `flip` shall make a change to a list, then glide every row that stayed and moved from its old place to its new one over `--duration-base` with `--ease-standard`, leaving new rows alone. `swap` shall replace what a pane shows at once, then fade the new content in over `--duration-base` with `--ease-enter`, sliding `--motion-slide` from the end when going in and from the start when going back, mirrored right to left. While the person prefers reduced motion, nothing shall move: `enter` and `swap` shall only fade over `--duration-fast`, `leave` shall still fade, and `flip` shall make the change without a glide. Where an element can't animate, each helper shall only make its change.

## Examples

- Given a message element,
  when it enters,
  then it fades in and rises 8px over 200ms.
- Given the person prefers reduced motion,
  when a pane swaps in,
  then the new content only fades in over 120ms and doesn't slide.
- Given a list whose second row moves up 40px,
  when the change runs through `flip`,
  then that row glides from 40px below to its place and the unmoved rows don't animate.
