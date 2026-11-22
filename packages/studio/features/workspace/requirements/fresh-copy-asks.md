# workspace.fresh-copy-asks

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5); first-run-flow 3.2 and 5, "Start over copies to the next free name and never overwrites" (HAL-7985); `workspace.try-sample`; words check C584 row 7 (HAL-15480, "old copy" as in Help, decided by the team under HAL-2282); Start over turns the first run off only once the copy is written (HAL-15519)

Where the app gives the window the demo (**Open demo**) and a way to be asked for a fresh copy (`FreshCopyAsks`), each ask shall make the same fresh copy of the demo as the demo chip's **Fresh copy of the demo**: the next free folder, never one that is there, opened once it is written, with the same toasts. An ask may come with a way to be told the copy is there: it shall be told once the copy is written, or found already there (`created` or `existing`), before the copy opens; never while the copy can't be written; and at most once, however often **Try again** is pressed. An ask made while a copy is being written shall wait for that copy. Without the demo, an ask shall do nothing.

## Examples

- Given the window has Open demo,
  when the first run's **Start over** asks for a fresh copy,
  then the sample host is asked for a copy with no known samples, and "Created Acme sample 2. Your old copy is still in Recent." shows.
- Given the window has no Open demo,
  when something asks for a fresh copy,
  then nothing happens.
- Given the window has Open demo,
  when an ask's copy is written, or is there already,
  then the asker is told before the copy opens.
- Given the sample host can't write the copy,
  when something asks for a fresh copy,
  then the asker isn't told and the failure toast offers **Try again**.
- Given the copy failed twice,
  when **Try again** then works,
  then the asker is told once.
