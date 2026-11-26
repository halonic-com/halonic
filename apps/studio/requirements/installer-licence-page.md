# studio.installer-licence-page

- Status: active
- Since: unreleased
- Source: HAL-12506 (board decision on HAL-8157, option A: Microsoft's "Distributable Code" terms for the `vcruntime140.dll` the installer ships); HAL-17810 (board decision on HAL-12716: Microsoft's own licence text, and only with srt as the sandbox); HAL-19294 (board decision on 26 Nov, option A for the silent installer, design HAL-18894: the licence moves into Halonic's sandbox step)

The Windows installer shall show no licence page and shall have no licence text of its own. In every install mode it shall install the runtime only under the inert name `vcruntime140.dll.pinned`, which nothing loads. When the person chooses srt as the sandbox in Halonic's sandbox setup step (in the first-run window or in Settings), Halonic shall show Microsoft's own licence for `vcruntime140.dll`, unchanged, before it asks Windows for administrator rights: the `license.rtf` of the Visual C++ Redistributable that `windows/vcruntime.json` pins, checked against the SHA-256 pinned there. Halonic shall place `vcruntime140.dll` beside srt-win only after the person presses **I Agree**. When the person doesn't agree, or the licence file doesn't match its pinned SHA-256, Halonic shall place no `vcruntime140.dll` and shall stay usable without the sandbox. The uninstaller shall delete both `vcruntime140.dll.pinned` and the `vcruntime140.dll` beside srt-win.

## Examples

- Given `windows/vcruntime.json`,
  when `windows/fetch-vcruntime.ps1` fetches the pinned redistributable,
  then it takes `license.rtf` out of it, stops unless its SHA-256 is the pinned one, and writes it unchanged to `binaries/vcruntime-licence.rtf`, which Halonic's sandbox step shows.
- Given the installer config,
  when the bundler reads it,
  then it names no `licenseFile` and no `vcruntime140.dll` resource, and `windows/licence.txt` doesn't exist.
- Given the installer template,
  when it lists its pages,
  then it has no licence page and no **I Agree**.
- Given the installer template,
  when it copies files, in any install mode,
  then it copies `vcruntime140.dll.pinned` and no file named `vcruntime140.dll`, and the uninstaller deletes `vcruntime140.dll.pinned` and the `vcruntime140.dll` beside srt-win.
- Given srt as the sandbox and no `vcruntime140.dll` beside srt-win,
  when the person opens Halonic's sandbox setup step,
  then Halonic shows Microsoft's licence from `vcruntime-licence.rtf` with **I Agree** before it starts the elevated helper,
  and only after **I Agree** does the helper copy `vcruntime140.dll.pinned` to `vcruntime140.dll` beside srt-win.
- Given a `vcruntime-licence.rtf` whose SHA-256 isn't the pinned one,
  when the person opens Halonic's sandbox setup step,
  then Halonic shows no **I Agree**, starts no elevated helper and places no `vcruntime140.dll`.
- Given the installer job in CI,
  when it runs the installer,
  then it never sees **I Agree**, and finds `vcruntime140.dll.pinned` in the install folder and no `vcruntime140.dll` anywhere.
