# sandbox-mxc.box-folders

- Status: active
- Since: unreleased
- Source: HAL-3305, HAL-3503 (grant rule 6, revised), HAL-7514, HAL-13373

The sandbox-mxc adapter shall make a new, empty box folder for every box, under one base folder inside Halonic's data folder, and never reuse one. Before a process makes its first box folder, the adapter shall give the base folder its own access list, the way Windows sets up Temp: inheritance turned off, and Full Control for only the current user, SYSTEM and Administrators, which the box folders inside inherit. It shall do so also when the base folder is already there, and shall make no box folder when that fails. On a real PC, MXC failed in every folder that inherited its access list from the user's AppData, and passed in Temp, which has its own. Removing a box folder shall remove everything in it, and removing it twice shall do nothing more. The first box folder a process makes shall first remove the box folders that processes no longer running left behind, such as after a crash, and shall keep those of processes that still run. When a leftover can't be removed because a program still holds it, it shall skip that folder and make the new one, and try again the next time a process clears leftovers.

## Examples

- Given two boxes made one after the other,
  when their folders are made,
  then each is a different, empty folder under `mxc-boxes` in Halonic's data folder.
- Given a base folder that inherits its access list from AppData, made by an older Halonic,
  when a Halonic makes its first box folder,
  then the base folder has its own access list, with inheritance off and Full Control for only the user, SYSTEM and Administrators.
- Given the access list can't be set,
  when a Halonic makes its first box folder,
  then no box folder is made, and the next one tries again.
- Given a box folder with files in it,
  when the box closes and removes it,
  then the folder and its files are gone.
- Given a box folder left behind by a Halonic that crashed,
  when the next Halonic makes its first box folder,
  then the leftover is removed.
- Given a box folder of a Halonic that still runs, such as the CLI next to Studio,
  when another Halonic makes its first box folder,
  then that folder stays.
- Given a leftover box folder that a program which outlived its Halonic still holds open,
  when the next Halonic makes its first box folder,
  then that folder is skipped and the new box folder is made.
