# studio.src-tauri.crates.sandbox-elevate.sandbox-elevate

- Status: draft
- Since: 0.1.0
- Source: HAL-1451, HAL-1415, HAL-7385, HAL-7386

When the agent sandbox is set up or removed on Windows, the only program that runs with administrator rights shall be the helper, given one fixed verb (`setup` or `remove`) and no options. The helper shall run srt-win only from a copy in an admin-only folder under Program Files whose SHA-256 matches the one built into the helper, with fixed arguments, from System32. It shall write nothing into that folder that Users can read before it is checked. It shall not ask for administrator rights a second time. After a setup that passes it shall list "Halonic agent sandbox" in Installed apps, and a removal that passes shall take that entry and its folder away. A signed release shall list it only when the helper's copy in that folder is signed by the same publisher as the helper itself.

## Examples

- Given a helper in the user's app folder with the shipped srt-win.exe next to it,
  when it runs `setup` with administrator rights,
  then srt-win's copy in `Program Files\Halonic Sandbox` runs `install` from System32, and Installed apps lists "Halonic agent sandbox".
- Given an srt-win.exe that someone swapped,
  when the helper runs `setup`,
  then it exits 33, writes none of it into the folder, deletes an earlier copy and runs nothing.
- Given the helper without administrator rights,
  when it runs `setup`,
  then it exits 31 and runs nothing.
- Given `setup --allow-loopback`, `install` or no argument,
  when the helper starts,
  then it exits 30 and runs nothing.
- Given a sandbox set up by the helper,
  when Installed apps runs the copy's `remove`,
  then srt-win runs `uninstall`, and the entry and the copies are gone.
- Given a release helper whose file in the app folder was swapped for another program while it ran,
  when it runs `setup`,
  then it exits 35, deletes its copy before Users could open it, runs nothing and writes no Installed apps entry.
- Given the helper's folder reached by another name (other letter case or a short name),
  when Installed apps runs the copy's `remove`,
  then the helper knows it runs from the folder and removes the sandbox.
- Given srt-win refuses to remove the sandbox,
  when the helper runs `remove`,
  then it exits with srt-win's code and the entry stays.
