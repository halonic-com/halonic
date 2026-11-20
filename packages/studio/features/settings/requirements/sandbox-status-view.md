# settings.sandbox-status-view

- Status: active
- Since: unreleased
- Source: HAL-5405 (PR 4); HAL-3777 (plan) header badge and status row; ux-checklists O9, O10 (HAL-11149)

The Studio shall turn the engine's typed sandbox choice into the header badge and the Settings status row, and decide nothing itself. With no saved choice there shall be no badge. A saved backend in use shall read **Sandbox: on** with the row **Ready**, its name and when the last check passed, and offer **Change** and **Turn off**. A saved choice of no sandbox shall read **No sandbox** and offer **Set up a sandbox**; the sentence that agents ask before running commands shall show only when the host says it really does. A backend waiting for the Windows restart shall read **Sandbox: setup unfinished** and offer **Restart now**. A backend whose safety test failed shall read **Sandbox: check failed**, say why, and offer **Check again** and **Change**. A saved backend with nothing proven yet, or while the host is still asking, shall show no badge and **Checking** with a busy **Check again**, never an error; a host that can't answer shall show no badge and say it couldn't check, with **Check again**. Every badge shall carry words and a screen-reader name "Sandbox status: *state*. Opens sandbox settings.", so no state rests on colour.

## Examples

- Given the saved backend is Sandbox in WSL and it is in use,
  when the status is made,
  then the badge reads "Sandbox: on" and the row offers Change and Turn off.
- Given the saved backend is saved but nothing has proven it yet,
  when the status is made,
  then no badge shows and the row says Checking.
- Given the host can't answer,
  when the status is made,
  then no badge shows and the row says "Couldn't check the sandbox: *reason*." with Check again.
