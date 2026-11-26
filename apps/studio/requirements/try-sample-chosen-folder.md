# studio.try-sample-chosen-folder

- Status: active
- Since: unreleased
- Source: first-run walk-through of the 0.2.0 build, gap G7; HAL-19383, HAL-19398

The desktop app's sample host shall also copy the demo into a folder the person picks, for **Choose a folder…** on Welcome (`shell.welcome-sample-error`). It shall show the shell's folder picker for a parent folder and, as for Documents (`studio.try-sample`), reopen a demo the device already knows there or make the first of `Acme demo`, `Acme demo 2`, … that is missing there, copy the example in and trust it, never writing into a folder that is there. If the folder can't be written, then the host shall say so with the picked folder's own name. If the shell refuses to show the picker, then the host shall say so as "another folder" with the shell's reason. If the person cancels the picker, then nothing is written and nothing is said.

## Examples

- Given the person picks `/docs/Projects`, then the shell makes `/docs/Projects/Acme demo` and the example's files are copied in.
- Given the shell refuses to make the folder in `Projects`, then the result is `cant` in `Projects` with the shell's reason.
- Given the shell is busy and refuses to show the picker, then the result is `cant` in "another folder" with the shell's reason, and nothing is written.
- Given the person cancels the picker, then the result is nothing and no folder is made.
