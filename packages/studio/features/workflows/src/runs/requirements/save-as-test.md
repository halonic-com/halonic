# workflows.runs.save-as-test

- Status: draft
- Since: 0.1.0
- Source: HAL-10228 (T7 PR 5c); flow-workflows 8 (`workflows.tests.save-run-as-test`); microcopy 9.5 and 9.7

When the host can write test cases, the workflows feature shall show **Save as test** on the card of a finished real run, in the Runs view and in the card docked after a run starts; it shall show none for a run that is still going or when the host can't write test cases. **Save as test** shall open a dialog titled "Save as test" with one field, **Name**, that starts as "Run *id*" with its text selected, and the buttons **Cancel** and **Create test**. **Create test** shall stay pressable with a problem: an empty name shall say "Give it a name." and a name another test of the workflow has shall say "There's already a test called “*name*”.", under the field, and nothing shall be written. Otherwise **Create test** shall ask the host to save the run as a test with that name and, once it has, open Configuration on Tests with the new case picked. When the host can't, the dialog shall stay open and say "Couldn't create the test: *reason*." with **Try again**.

## Examples

- Given a finished run and a host that writes test cases, then the run's card has **Save as test**; given a running run, or a host that doesn't, it has none.
- Given the dialog opens, then **Name** reads "Run 01jd8q".
- Given the name is emptied and the person presses **Create test**, then the field says "Give it a name." and the host is not asked.
- Given a test called "Happy path" exists, when the name "Happy path" is created, then the field says "There's already a test called “Happy path”." and the host is not asked.
- Given the name "Happy path", then the host is asked to save the run under it, Configuration opens on Tests and the case "Happy path" is picked.
- Given the host fails with "The disk is full", then the dialog says "Couldn't create the test: The disk is full." and stays open.
