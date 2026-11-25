# settings.about-update-track

- Status: active
- Since: unreleased
- Source: HAL-18656; the board's approval of option A on HAL-18478 (sketch and wording); Chief's default-track decision on HAL-18474 and HAL-18480

Where Studio installs its own updates (no other tool manages them, and the section has an updater), Settings › About Halonic shall show, straight under **Update Halonic automatically**, a radio group **Update track** with the options **Stable**, "Released versions. Recommended.", and **Preview**, "Every build that passes our tests, sometimes several a day. Not for general use.". The picked option shall be the track the updater's status names; when the status names none, Preview for a Preview build (`<version>-preview.<n>`) and Stable for every other. Picking an option shall save it through the updater's `setTrack` and then count as one press of **Check now** on that track, with no confirm dialog. While Stable is picked and a Preview build runs, the section shall show the muted line "You stay on Halonic <version> until the next Stable version is out. Halonic then updates to it.". While a Preview build runs, a neutral "Preview" chip shall stand beside the version's heading. A managed install (Scoop) and the view-only section of a Studio served in a browser shall show no Update track.

## Examples

- Given a stable build `0.1.0` with no track saved,
  when About Halonic opens,
  then Stable is picked and nothing is checked.
- Given a Preview build `0.1.1-preview.42` with no track saved,
  when About Halonic opens,
  then Preview is picked and a "Preview" chip stands beside "Halonic 0.1.1-preview.42".
- Given Stable is picked,
  when the person picks Preview,
  then the track is saved and one check of the Preview track runs.
- Given a Preview build with `0.1.1-preview.43` ready to install,
  when the person picks Stable,
  then the line "You stay on Halonic 0.1.1-preview.42 until the next Stable version is out. Halonic then updates to it." shows and the ready update is gone.
- Given Scoop manages updates,
  when About Halonic opens,
  then there is no Update track.
