# app.unfenced-runs

- Status: active
- Since: 0.1.0
- Source: HAL-3385; the "Runs" line design on HAL-1873 (section 7, and Julian's build conditions (a) and (d) in section 11), approved by the board on HAL-1949; I5 design 4.3.1 on HAL-958

The app shall let plugin and integration code run without the sandbox only when the fence status, asked before every start, is `not-fenced` and the user's saved yes is for that same reason. It shall ask again (`needs-yes`) when there is no yes, when the reason differs from the saved one, when the saved yes can't be read, after the computer was seen in the sandbox (which removes the saved yes), and after Take back. A `stopped` status shall never run. Saving a yes shall keep its reason and time and replace any other. Take back shall remove the yes and stop every registered run without the sandbox before it returns, and report the runs that didn't stop.

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
