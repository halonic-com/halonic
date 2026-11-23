# files.problems.home

- Status: active
- Since: unreleased
- Source: HAL-16787 (part 2b of HAL-14903); C348 on HAL-14317, option A, ST5 and A2, A6

While the open workspace's shared list of files with errors (`studio.files-with-errors`) holds at least one file, the Studio shall show Home's Problems section, its heading followed by the count of those files, "Problems · 1 file" or "Problems · 6 files", and under it the first five files in the list's order, each with its kind's icon, its name, "Line N: *reason*" of its first error and a chip with its count of errors, "1 problem" or "3 problems"; a screen reader shall hear a row as "Sorter, agent, 1 problem. Line 2: *reason*". Opening a row shall open its file in Files with the cursor on its first error. With more than five files, the section shall end with "Show all 12 files", which shall open the same list as the status bar's **Show**. With no file with errors, the Studio shall leave the whole section out, its heading included. The status bar, Home and a workflow's page shall share one read of the list after each change of the files.

## Examples

- Given the workspace has six files with errors,
  then Home's first section reads "Problems · 6 files" and lists five of them, then "Show all 6 files".
- Given the agent Sorter's first error is on line 2,
  when its row on Home is opened,
  then Sorter's file opens in Files with the cursor on line 2.
- Given a save fixes the last file with errors,
  then Home has no Problems section.
- Given the status bar and Home both show the count,
  when a save changes a file,
  then the list is read once.
