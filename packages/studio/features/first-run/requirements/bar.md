# first-run.bar

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes 2); first-run-flow 2, 5 and 8b (HAL-7985); `shell.frame-strips`

While the first run (`first-run.state`) is on in the open folder, the First Run feature shall show the first-run bar under the top bar, on every page, as a region named "First run": at its left the strip `1 Demo · 2 Model · 3 Run · 4 Approve`, the steps before the current one with a tick and read as "done", the current one with the ring-and-dot and `aria-current="step"`, a failed run's Run step with a red cross and read as "failed", and the steps after it with an empty ring; at its right the step's one way out. At Demo the way out shall be **Skip, I'll explore**, which pauses the first run, after which the bar is gone. At the other steps the bar shall show no way out until the screens that own them are built (**Set up later** with the model screen, **Something wrong?** with the Check this computer dialog, **Cancel run** with the run's build). The bar shall draw nothing while the first run is off, paused, done, or on in another folder.

## Examples

- Given the first run is on at Demo,
  when any page shows,
  then the bar reads "1 Demo 2 Model 3 Run 4 Approve", Demo is the current step, and **Skip, I'll explore** is at its right.
- Given a run of Support reply failed,
  when the bar shows,
  then Demo and Model are ticked, Run has a red cross and is read "3 Run, failed", and no way out shows.
- Given the run waits for you,
  when the bar shows,
  then Approve is the current step.
- Given a folder that isn't the demo,
  when its pages show,
  then there is no bar.
