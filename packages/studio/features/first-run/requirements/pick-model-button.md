# first-run.pick-model-button

- Status: active
- Since: unreleased
- Source: HAL-13432; first-run-flow revision 7, section 3.3, 6 and 8e, approved by the board on HAL-7993

The Pick a model screen shall have one button. For Sample answers it shall continue at once. For the local option while no model is downloaded or none is found, it shall check again. For the key and local options it shall test the choice, with the pasted key or, when one is saved and the person hasn't pressed Replace, the saved key, and continue only when the test passed. When the trust line after the test isn't the one shown before it, the screen shall show the new line and continue only on a second press. A Continue that didn't save shall say what failed and whether the key was saved.

## Examples

- Given a pasted key whose test passes and whose trust line is the one shown,
  then the screen continues with that test's fingerprint.
- Given a test that passes but whose line now reaches nothing new,
  then the screen shows that line and waits for Continue.
- Given the local option with no model downloaded,
  then the button checks again and makes no test call.
