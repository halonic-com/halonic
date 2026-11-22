# app.run-proposal-compare-choice

- Status: active
- Since: unreleased
- Source: HAL-10916 (Inbox run proposals, row Q9 of HAL-11945: Keep mine, Use the run's, Combine both); `app.run-proposal-accept` (`changedOnDisk` waits for Compare)

When the person changed a file of a run's proposal after the run started and chooses Use the run's in Compare, the proposal service shall write the run's text, or move the file to Halonic's trash for a file the run deleted, and mark the file accepted. When they choose Combine both, the proposal service shall write the saved text and the run's put together over the run's base, and mark the file accepted; when the two change the same lines, or one of them is no file, it shall write nothing and refuse with `CannotCombineError`. Either choice shall be written only while the saved file still holds what Compare showed (`seen`), and otherwise the proposal service shall write nothing, keep the file undecided and list it under `changedOnDisk`. It shall give back the file it wrote and the decisions record as one undo step, as Accept does. Trust rule A holds as for Accept (`app.run-proposal-trust`). A file that is already decided, or that the run doesn't propose, shall be refused. Keep mine is a reject (`app.run-proposal-reject`).

## Examples

- Given run `01JD8Q` changed the model of `clerk` and the person has since changed its name,
  when they choose Use the run's with the digest of their text,
  then the file has the run's text, the decision says accepted, and undoing the step brings back their text and "undecided".
- Given the same proposal,
  when they choose Combine both,
  then the file has the person's name and the run's model.
- Given the person changed the model too,
  when they choose Combine both,
  then nothing is written and the choice is refused with `CannotCombineError`.
- Given the person edited the file again after Compare showed it,
  when they choose Use the run's with the digest Compare showed,
  then nothing is written, the file is listed under `changedOnDisk` and stays undecided.
- Given run `01JD8Q` deleted `agents/old.agent.yaml` and the person has since edited it,
  when they choose Use the run's,
  then the file is in the trash.
- Given the person already rejected the file,
  when they choose Use the run's,
  then the choice is refused and nothing is written.
