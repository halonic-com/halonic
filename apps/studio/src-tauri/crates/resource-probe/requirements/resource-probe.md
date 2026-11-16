# studio.src-tauri.crates.resource-probe.resource-probe

- Status: draft
- Since: 0.1.0
- Source: HAL-11118, HAL-11121

When the shell reads the numbers for the status bar's resources item, it shall give the memory this app's process holds in RAM, the space free to the person on the drive that holds a folder, and the total size of the files in a folder. The free space shall be read from the nearest folder that exists when the folder itself doesn't exist yet. A folder that doesn't exist shall take nothing. The size shall not follow symbolic links, so a link out of the folder or back into it counts nothing. A file removed while the folder is read shall be skipped. The memory is this process only: a web view's own processes are not counted.

## Examples

- Given a folder with a 100-byte file and a subfolder holding files of 20 and 3 bytes,
  when the shell asks how much it takes,
  then the answer is 123.
- Given a folder with a link to a folder holding a 5,000-byte file,
  when the shell asks how much it takes,
  then the link counts nothing.
- Given a profile folder that nothing has written to yet,
  when the shell asks for the free space of its drive,
  then it gets the free space of the nearest folder above it that exists.
