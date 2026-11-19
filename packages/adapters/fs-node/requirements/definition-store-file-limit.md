# fs-node.definition-store-file-limit

- Status: draft
- Since: unreleased
- Source: HAL-12295, for the doctor's line about Studio's folder watch limit (decided by Liam on HAL-12296)

The folder definition store shall say whether its root holds more than a given number of files, counting the files `list()` gives and leaving out what it leaves out. It shall stop counting at the first file over that number.

## Examples

- Given a root holding three files, one of them under `.git`,
  when it is asked whether there are more than 2,
  then it says no; asked about more than 1, it says yes.
- Given a root holding 50 files in 5 folders,
  when it is asked whether there are more than 3,
  then it says yes; asked about more than 50, it says no.
- Given a missing root,
  when it is asked whether there are more than 0,
  then it says no.
