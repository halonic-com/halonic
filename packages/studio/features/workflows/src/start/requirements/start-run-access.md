# workflows.start.start-run-access

- Status: draft
- Since: unreleased
- Source: HAL-12457 (a11y check HAL-12426, rows A5 to A7); microcopy 9.6 and 19.3 (canvas strip)

While a run's card is docked at the right, when the run's state changes, the workflows feature shall read the change to screen readers through the window's announcer under the run page's key `run:<id>`, in 19.3's canvas-strip words: "Run *01jd8q* needs you, waiting in *step*.", "Run *01jd8q* is done.", "Run *01jd8q* failed in *step*.", "Run *01jd8q* was cancelled in the step *step*.", and "Run *01jd8q* is running again." after a wait; it shall read nothing for a run that is simply running, and the same state only once. When **Start run** has started the run, focus shall move at once to the dock's line "Run started. Waiting for it to appear…", and on to the run card's heading when the run shows. When the input isn't a JSON object, focus shall move to the input, whose description is then the error.

## Examples

- Given the docked run 01jd8q starts running and then waits for an approval in the step *Approve this reply?*, then screen readers hear "Run 01jd8q needs you, waiting in Approve this reply?" under the key `run:run_mfx3k2a1_01jd8q`, and nothing while it was only running.
- Given that run then finishes, then they hear "Run 01jd8q is done."
- Given a run that fails in *Draft reply*, then they hear "Run 01jd8q failed in Draft reply."
- Given a run that waited and goes on, then they hear "Run 01jd8q is running again."
- Given the person presses **Start run** and the runs don't list the new run yet, then focus is on "Run started. Waiting for it to appear…", not on the page.
- Given the input `[1]`, when the person presses **Start run**, then focus moves to the input, which is invalid and described by "The input has to be a JSON object, such as {}."; pressing it again moves focus there again.
