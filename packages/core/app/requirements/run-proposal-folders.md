# app.run-proposal-folders

- Status: active
- Since: 0.1.0
- Source: HAL-4776; HAL-4790; HAL-4808 (Liam's review of halonic#1547, point 3)

The proposal folders shall give the engine the run proposal service's worktrees and copies as the folders top-level runs write workspace files in. When the engine opens a run's folder, they shall open it at the commit the host read the run's definitions from, or from the saved files when the host read those, and a run that is open shall get its folder again. When the engine ends a run's folder, they shall end it as the proposal service does, without throwing. When the host starts, before the engine starts any run, they shall first end the folder of every run the engine has already ended, so what it changed becomes its proposal, and then remove what is left of ends that couldn't finish; the folders of runs the engine hasn't ended shall stay.

## Examples

- Given run `01JD8Q` whose definitions were read at commit `a1b2c3`,
  when the engine opens its folder,
  then the folder holds the files of `a1b2c3`.
- Given run `01JD8Q` has an open folder,
  when the engine opens its folder again,
  then it gets the same folder.
- Given Halonic stopped after the engine recorded that run `01JD8Q` completed but before it ended the run's folder, where the run had changed a file,
  when the host starts,
  then the folder is gone and the run's proposal holds the changed file.
- Given run `7KQ2MX` waits for a person with its folder open,
  when the host starts,
  then its folder stays, with what the run wrote there.
