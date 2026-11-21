# first-run.state

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes 1); first-run-flow 2, 3.5 and 5 (HAL-7985, approved HAL-7993)

The First Run feature shall keep one first-run state on this device, saved through the app after every change and read back when a folder opens, so it is kept after a restart: off until it starts, on at one of the steps Demo, Model, Run and Approve in the folder it started in, paused at a step, or done. It shall turn on at Demo the first time the first-run bar shows in a folder the device remembers as the demo, and never again by itself once it was on, paused or done. While it is on or paused in the open folder, it shall follow the newest real run of the `support-reply` workflow that started after it began: a run going on puts it at Run, a run waiting for you at Approve, a failed run at Run marked failed, and a run that finished without **Approve** (its reply rejected) at Run marked ended. A run that finished after **Approve** shall be the first win: the state shall be done, also when it was paused. **Skip, I'll explore** shall pause it at its step, and while paused only the first win shall change it; taking it up again shall put it back at its step and follow the runs from there. A state that can't be read shall count as off. Test runs and runs from before it began shall not move it.

## Examples

- Given a device with no first run,
  when the bar shows in a fresh copy of the demo,
  then the first run is on at Demo in that folder, and saved.
- Given the first run is on at Demo,
  when a run of Support reply starts and then waits for you,
  then it is at Run, then at Approve.
- Given a run of Support reply that waits for you,
  when the user approves the reply in the Inbox and the run finishes,
  then the first run is done, also after a restart.
- Given the user rejects the reply,
  when the run finishes,
  then the first run is at Run, marked ended.
- Given the first run is on at Demo,
  when the user presses **Skip, I'll explore**,
  then it is paused at Demo.
