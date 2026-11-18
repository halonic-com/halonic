# routines.page.run-dialog

- Status: draft
- Since: unreleased
- Source: HAL-12170; flow-routines 3.8

Where the host can make a routine live, **Run now** on a routine that has changes that aren't live, or that never had a version, shall open a dialog first instead of starting at once; the dialog shall say which version runs and offer **Make live first** or, for a routine that never had a version, **Make live and run**, and Cancel shall change nothing.

## Examples

- Given "Daily" has changes that aren't live and its live version is from 10:42, when **Run now** is pressed, then a dialog "Run Daily now?" says "Runs the live version from 10:42. Your changes aren't in it." and no run starts.
- Given that dialog, when **Run now** in it is pressed, then the live version runs and the dialog closes.
- Given that dialog, when Cancel is pressed, then nothing starts and nothing is made live.
- Given that dialog, when **Make live first** is pressed and the version is made, then the dialog says "Runs the live version from 10:58." and has no **Make live first**.
- Given that dialog, when the version can't be made, then a toast says "Couldn't make Daily live." with the reason and the dialog stays.
- Given "Daily" never had a version, then the dialog has **Make live and run** and no **Run now**, and the run starts once the version is made.
- Given "Daily" has no changes that aren't live, or the host can't make a routine live, then **Run now** starts at once.
