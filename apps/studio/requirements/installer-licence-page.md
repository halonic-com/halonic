# studio.installer-licence-page

- Status: active
- Since: unreleased
- Source: HAL-12506 (board decision on HAL-8157, option A: Microsoft's "Distributable Code" terms for the `vcruntime140.dll` the installer ships); HAL-17810 (board decision on HAL-12716: Microsoft's own licence text, and only with srt as the sandbox)

When the Windows installer runs with its pages and the person leaves **Set up the agent sandbox** ticked, on the install page or the run-again page, it shall then show Microsoft's own licence for `vcruntime140.dll`, unchanged: the `license.rtf` of the Visual C++ Redistributable that `windows/vcruntime.json` pins, checked against the SHA-256 pinned there. It shall install `vcruntime140.dll` only after the person presses **I Agree**. When the box is cleared, it shall show no licence page and shall install no `vcruntime140.dll` under any name. The installer shall have no licence text of its own. Passive, update and silent installs shall show no page; of those, only a silent install with `/SANDBOX=1`, and an install over one that already has the file, shall install it.

## Examples

- Given `windows/vcruntime.json`,
  when `windows/fetch-vcruntime.ps1` fetches the pinned redistributable,
  then it takes `license.rtf` out of it, stops unless its SHA-256 is the pinned one, and writes it unchanged to `binaries/vcruntime-licence.rtf`, which the installer's licence page shows.
- Given the installer config,
  when the bundler reads it,
  then it names no `licenseFile` and no `vcruntime140.dll` resource, and `windows/licence.txt` doesn't exist.
- Given the installer template,
  when it lists its pages,
  then the licence page comes after the install page and before the steps, and its skip function stops it unless the sandbox box is ticked, and for passive and update installs.
- Given the installer template,
  when it copies files,
  then it copies `vcruntime140.dll.pinned` only when the sandbox step is chosen or the file is already there, and the uninstaller deletes it.
- Given the installer job in CI,
  when it walks the pages with the sandbox box ticked,
  then it presses **Next**, finds Microsoft's licence on the licence page with no word of Halonic's, presses **I Agree**, and finds the pinned DLL in the install folder and beside srt-win;
  and when it walks them with the box cleared, it presses **Install**, never sees **I Agree**, and finds no `vcruntime140` file in the install folder.
