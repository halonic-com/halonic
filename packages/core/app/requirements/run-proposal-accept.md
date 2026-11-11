# app.run-proposal-accept

- Status: active
- Since: 0.1.0
- Source: save model 7 and 1.7; engine answer 2 on HAL-3267 ("Accept"); HAL-4121; HAL-3248; HAL-5218

When the person accepts a file of a run's proposal, or all of it, the proposal service shall write each undecided file it covers with `expected` set to the file's digest at the run's base (`absent` for a file the run added), moving a file the run deleted to Halonic's trash the same way, and mark it accepted. If the saved file is no longer the run's base, the proposal service shall write nothing for that file, keep it undecided and list it under `changedOnDisk`, and `compare` shall give its base, saved and run texts. The proposal service shall give back the files it wrote and the decisions record, before and after, as one undo step, or no step when it wrote no file, even if decisions changed (a refused file becoming not applicable, or a file already as the run left it becoming accepted): Undo brings back files, and a refused file stays not applicable. When the person undoes or redoes that step, the proposal service shall write each entry back only while it still holds what the step left, and list any other under `changedOnDisk`; while the run's decisions record no longer holds what the step left, the proposal service shall write nothing of the step and list every entry under `changedOnDisk`.

## Examples

- Given run `01JD8Q` changed the model of `clerk` and the saved `agents/clerk.agent.yaml` is still the run's base,
  when the person accepts that file,
  then the file has the run's model, the decision says accepted, and undoing the step brings back both the old file and "undecided".
- Given the person edited `agents/clerk.agent.yaml` after run `01JD8Q` started,
  when they accept it,
  then nothing is written, the file is listed under `changedOnDisk` and stays undecided, and `compare` gives the base, the person's text and the run's.
- Given Accept all on three files, one of them changed on disk,
  when the person accepts,
  then the other two are written as one undo step and the third is listed under `changedOnDisk`.
- Given run `01JD8Q` added `notes/today.md` and the person has since created a file with that name,
  when they accept it,
  then it is listed under `changedOnDisk`, not overwritten.
- Given run `01JD8Q` deleted `agents/old.agent.yaml`,
  when the person accepts it,
  then the file is in the trash, and undoing brings it back.
- Given the person accepted `agents/clerk.agent.yaml` and edited it again,
  when they undo the Accept,
  then their edit stays and the file is listed under `changedOnDisk`.
- Given the person accepted `agents/clerk.agent.yaml` and then rejected `notes/today.md` of the same run,
  when they undo the Accept,
  then nothing is written, the file keeps the run's text, its decision still says accepted, and both entries of the step are listed under `changedOnDisk`.
