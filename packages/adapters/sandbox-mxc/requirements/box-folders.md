# sandbox-mxc.box-folders

- Status: active
- Since: 0.1.0
- Source: HAL-3305, HAL-3503 (grant rule 6), HAL-7514

The sandbox-mxc adapter shall make a new, empty box folder for every box, under one base folder inside Halonic's data folder, and never reuse one. Removing a box folder shall remove everything in it, and removing it twice shall do nothing more. The first box folder a process makes shall first remove the box folders that processes no longer running left behind, such as after a crash, and shall keep those of processes that still run. When a leftover can't be removed because a program still holds it, it shall skip that folder and make the new one, and try again the next time a process clears leftovers.

## Examples

- Given two boxes made one after the other,
  when their folders are made,
  then each is a different, empty folder under `mxc-boxes` in Halonic's data folder.
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
