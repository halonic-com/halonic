# files.problems.count

- Status: active
- Since: unreleased
- Source: HAL-14903 (part 2 of HAL-14370); C348 on HAL-14317, option A, ST5 and A1, A4

While the open workspace's shared list of files with errors (`studio.files-with-errors`) holds at least one file, the Studio shall show the count of those files, "1 file with a problem · Show" or "6 files with problems · Show", in the status bar on the desktop and in a strip under the header on a phone, and shall show nothing at zero. **Show** shall list each file in the list's order with its name, "Line N: *reason*" of its first error and its kind, in a menu on the desktop and in a sheet titled with the count on a phone, under the line "Each opens its file at the first problem."; picking a file shall open it in Files with the cursor on its first error. A change of the count after the first read shall be announced once, politely: the new count, or "No files with problems" at zero.

## Examples

- Given the workspace has one file with errors,
  then the status bar shows "1 file with a problem · Show".
- Given the agent Sorter's first error is on line 2,
  when **Show** is pressed and Sorter is picked,
  then Sorter's file opens in Files with the cursor on line 2.
- Given the workspace has no file with errors,
  then the status bar shows no count and the phone shows no strip.
- Given a phone and six files with errors,
  when **Show** is pressed,
  then a sheet titled "6 files with problems" lists the six files.
- Given the status bar shows "2 files with problems",
  when a save fixes one of them,
  then a screen reader hears "1 file with a problem".
