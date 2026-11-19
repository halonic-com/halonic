# settings.sandbox-status-view

- Status: active
- Since: unreleased
- Source: HAL-5405 (PR 4); HAL-3777 (plan) header badge and status row; ux-checklists O9, O10 (HAL-11149); SB1–SB4 (HAL-13743)

The Studio shall turn the engine's typed sandbox choice into the header badge and the Settings status row, and decide nothing itself. With no saved choice there shall be no badge. A saved backend in use shall read **Sandbox: on** with the row **Ready**, its name and when the last check passed, and offer **Change** and **Turn off**. A saved choice of no sandbox shall read **No sandbox** and offer **Set up a sandbox**; the sentence that agents ask before running commands shall show only when the host says it really does, and without it the row shall have no line. A backend waiting for the Windows restart shall read **Sandbox: setup unfinished** and offer **Restart now**. A backend whose safety test failed, or that is no longer available, shall read **Sandbox: check failed**, say why, and offer **Check again** and **Change**; a backend that needs setting up for any other reason shall read **Sandbox: setup unfinished** and offer **Set up** and **Change**, so a saved choice that isn't protecting the person always keeps a badge. A saved backend with nothing proven yet, or while the host is still asking, shall show no badge and **Checking** with a busy **Check again**, never an error; a host that can't answer shall show no badge and say it couldn't check, with **Check again**. A reason after a colon shall read on in lower case, unless its first word is a name or an abbreviation (WSL, Windows, Linux, macOS, Docker, Halonic, or any word with capitals inside it), which keeps its capitals. Every badge shall carry words and a screen-reader name made of its visible words and then "Opens sandbox settings." ("Sandbox: on. Opens sandbox settings."), so no state rests on colour and voice control finds it by what it shows.

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
- Given the saved backend is Sandbox in WSL and WSL is no longer installed,
  when the status is made,
  then the badge reads "Sandbox: check failed" and the row says "The sandbox isn't ready: WSL isn't installed yet."
- Given the saved backend needs setting up for a reason other than the restart,
  when the status is made,
  then the badge reads "Sandbox: setup unfinished" and the row offers Set up and Change.
