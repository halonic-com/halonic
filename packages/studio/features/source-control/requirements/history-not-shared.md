# source-control.history-not-shared

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.12; design-source-control (HAL-611) 3

While the folder has a place to share to, the source control feature shall know which versions in History the shared copy lacks, by what git last knew of the shared copy, without asking the shared copy: before the first share that is every version in History. When the screen is a phone, a version in History that the shared copy lacks shall carry a neutral "Not shared yet" chip at the start of its meta line, and every History row shall end in a chevron. When git can't say which versions the shared copy lacks, no version shall carry the chip. It shall read through the shell's `git log`, which is on the allow-list as it is.

## Examples

- Given a folder shared once, then two new versions, one of which touches the workspace folder,
  then that one version is listed as not shared, and none is after sharing again.
- Given a folder with a share address and two versions, before the first share,
  then both versions are listed as not shared.
- Given a phone and 3 versions, the newest of which the shared copy lacks,
  then the newest row's meta line starts with "Not shared yet", the other two have no chip, and every row ends in a chevron.
- Given a phone and a folder with no share address,
  then no History row has the chip.
