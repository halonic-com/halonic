# workspace.fresh-copy-asks

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5); first-run-flow 3.2 and 5, "Start over copies to the next free name and never overwrites" (HAL-7985); `workspace.try-sample`

Where the app gives the window the demo (**Open demo**) and a way to be asked for a fresh copy (`FreshCopyAsks`), each ask shall make the same fresh copy of the demo as the demo chip's **Fresh copy of the demo**: the next free folder, never one that is there, opened once it is written, with the same toasts. Without the demo, an ask shall do nothing.

## Examples

- Given the window has Open demo,
  when the first run's **Start over** asks for a fresh copy,
  then the sample host is asked for a copy with no known samples, and "Created Acme sample 2. Your earlier copy is still in Recent." shows.
- Given the window has no Open demo,
  when something asks for a fresh copy,
  then nothing happens.
