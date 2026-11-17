# shell.resource-status-item

- Status: active
- Since: unreleased
- Source: HAL-1845 (PR 1b); microcopy 22 F11, F12, F19 and 19.2; UX checklist part 1, 1.3 (HAL-1847); board answer HAL-1720

The desktop app's status bar shall show, after the items features added, one plain-text item with the memory Halonic uses and the free space on the drive that holds Halonic's data folder, such as "230 MB · 48 GB free". The memory shall be the engine's plus that of each process it started, in whole MB below 1 GB and in GB with one decimal from 1 GB. The free space shall be in whole GB, with one decimal below 10 GB. The item shall have no button, no Tab stop and no action. Its name for a screen reader, which is also its tooltip, shall be "Halonic uses _230 MB_ of memory. _48 GB_ free on this disk." The item shall read the engine's resource report every 30 s and when the window comes to the front. Until a reading arrives, the item shall show nothing. The item shall show from 900px wide and shall give way, from 900 to 1199px, to an item marked `data-status-update` in the same status bar. When less than 1 GB is free, the item shall read "Low on disk space: _0.8 GB_ free" in the warning colour, with a warning mark, and its name shall be "Low on disk space: _0.8 GB_ free. Free some space so runs can write their logs."; the low-disk item shall show from 900px even when a `data-status-update` item is there. When less than 0.1 GB is free, the free space shall read "less than 0.1 GB". When the next reading has 1 GB or more free, the item shall return to its normal form without a reload. The item shall not announce a change.

## Examples

- Given the engine uses 150 MB, its harness 80 MB, and 48 GB are free,
  when the status bar shows,
  then the item reads "230 MB · 48 GB free" and its tooltip reads "Halonic uses 230 MB of memory. 48 GB free on this disk."
- Given 0.8 GB are free,
  when the next reading arrives,
  then the item reads "Low on disk space: 0.8 GB free" in the warning colour.
- Given 0.04 GB are free,
  when the next reading arrives,
  then the item reads "Low on disk space: less than 0.1 GB free".
- Given the disk was low and the next reading has 12 GB free,
  when the reading arrives,
  then the item reads "… · 12 GB free" without a reload.
- Given 30 s pass, or the window comes to the front,
  when the item is on screen,
  then the shell reads the report again.
