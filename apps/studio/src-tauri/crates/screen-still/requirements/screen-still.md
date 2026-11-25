# studio.src-tauri.crates.screen-still.screen-still

- Status: draft
- Since: unreleased
- Source: HAL-18778, HAL-18563 (board request on HAL-10, 25 Nov); sketch on HAL-18562

When the shell asks for a still of one screen, the crate shall read that screen's pixels once, into memory only, and hand them back as opaque RGBA rows, top row first, without writing a file. On Windows it shall read them with GDI and on Linux over X11. On macOS, on Linux under Wayland, or on a screen whose pixels aren't 32 bits, it shall refuse as unavailable rather than return a wrong picture, and macOS shall show no prompt. When asked to crop a still, it shall return only the pixels inside the box, and nothing for an empty box or one that reaches outside the still.

## Examples

- Given a 3 × 2 still,
  when the shell crops the box at (1, 1) of 2 × 1,
  then it gets the two pixels of the second row's last two columns.
- Given the same still,
  when the shell crops a box of 2 × 1 at (2, 0),
  then it gets no crop.
- Given rows of BGRA pixels with padding at the end of each row,
  when they become a still,
  then each pixel's red and blue swap, the padding is dropped and every pixel is opaque.
- Given macOS,
  when the shell asks for a still,
  then it is refused as unavailable and macOS shows no prompt.
