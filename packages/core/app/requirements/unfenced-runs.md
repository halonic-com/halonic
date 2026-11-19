# app.unfenced-runs

- Status: active
- Since: 0.1.0
- Source: HAL-3385; the "Runs" line design on HAL-1873 (section 7, and Julian's build conditions (a) and (d) in section 11), approved by the board on HAL-1949; I5 design 4.3.1 on HAL-958

The app shall let plugin and integration code run without the sandbox only when the fence status, asked before every start, is `not-fenced` and the user's saved yes is for that same reason. It shall ask again (`needs-yes`) when there is no yes, when the reason differs from the saved one, when the saved yes can't be read, after the computer was seen in the sandbox (which removes the saved yes), and after Take back. A `stopped` status shall never run. Saving a yes shall keep its reason and time and replace any other. Take back shall remove the yes, wait for every start without the sandbox that is still in progress, and stop every registered run without the sandbox in this process before it returns, and report the runs that didn't stop. Every process keeps its own runs but shares the saved yes, so while runs without the sandbox are registered, each process shall read the saved yes again every second (`savedYesCheckMs`) and stop each run whose yes is gone, can't be read or is for another reason; a run that fails to stop is tried again at the next check. A Take back in Studio so stops a CLI runner too, within about a second (HAL-12344, finding M2 of the P10 security review on HAL-1743).

## Examples

- Given no saved yes and the status `not-fenced` for `windows`,
  then the decision is `needs-yes` for `windows`.
- Given the user allowed `windows` on 9 Nov,
  when the status is `not-fenced` for `windows`,
  then the decision is `allowed`, with that reason and date.
- Given a yes for `container`,
  when the status is `not-fenced` for `bubblewrap-missing`,
  then the decision is `needs-yes` for `bubblewrap-missing`.
- Given a yes for `bubblewrap-missing`,
  when the computer is seen `fenced` and later `not-fenced` for `bubblewrap-missing` again,
  then the decision is `needs-yes`.
- Given a yes that can't be read,
  then the decision is `needs-yes`, with the store's error for the host.
- Given a yes and the status `stopped`,
  then the decision is `stopped`.
- Given a yes and two registered runs without the sandbox,
  when the user takes the yes back,
  then both are stopped before Take back returns, and the next decision is `needs-yes`.
- Given a registered run that unregistered when it stopped by itself,
  when the user takes the yes back,
  then it isn't stopped again.
- Given one registered run that fails to stop,
  when the user takes the yes back,
  then the other runs are still stopped, the yes is gone, and Take back rejects naming how many didn't stop.
- Given a yes and a start without the sandbox still in progress,
  when the user takes the yes back,
  then Take back returns only after that start finished and stopped what it started.
- Given a run without the sandbox in one process,
  when the user takes the yes back in another process,
  then the run is stopped at the next check of the saved yes, and the checks end.
- Given a run for `container`,
  when the saved yes is replaced by one for `bubblewrap-missing`, or can't be read,
  then the run is stopped at the next check.
- Given a run that fails to stop after its yes is gone,
  then the next check tries to stop it again.
