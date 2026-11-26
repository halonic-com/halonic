# Decision: a window comes back fully on a screen, fullscreen kept

- Approval: the board asked for this on HAL-10 (HAL-19534: "If a monitor is gone or the resolution changed, move the window fully onto a visible screen"); Liam approved the plan on HAL-19566 and signs this note in review
- Kind: user-visible

`studio.src-tauri.window-place` moved a window only when less than 64 pixels
of it were on any screen, and then always to the middle of the primary
screen. A window half off a screen stayed half off it. The board wants every
window back fully on a visible screen. So the rule changes: a window not all
on the connected screens' work areas taken together (give or take the
frame's invisible border, 8 pixels times the highest screen scale, which a
window snapped to an edge has past it) moves fully onto the work area it
overlaps most, as near its place as fits. A window across two connected
screens, all of it on them, stays where it is. One that overlaps no screen
still goes to the middle of the primary screen. Work areas replace the screens'
full sizes, so a window no longer comes back under the taskbar.

One test's expectation changes with it:
`a_window_barely_on_screen_moves_to_the_primary` becomes
`a_window_barely_on_screen_moves_fully_onto_it`, since a window with 20
pixels left on the ultrawide now moves fully onto the ultrawide's right edge
instead of to its middle. No test is dropped.

The requirement also gains fullscreen as kept state, and a maximised or
fullscreen window whose screen is gone opens that way on the primary screen.

## Covers

- studio.src-tauri.window-place
