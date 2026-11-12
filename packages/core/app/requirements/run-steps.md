# app.run-steps

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8); cli-output revision 31, 3.4; ux-checklists-t8-t9 revision 10, 1.10 (HAL-1360)

The app shall read the steps a run reached from its run log, in the order it reached them: each step's state, the agent the step ran, and how the step ended or where it is now. The command line's step lines and the Studio's Every step shall both read them from the app, so the two say the same about a run.

A step shall be done or failed with how long it took, or answered with the event the user sent and when. Only a step the workflow itself entered shall be a step: the events of a parallel branch or a for-each item shall belong to their step. The end state the run finished in shall not be a step.

When the log hasn't ended the last step, the step shall take where the run is, the first that applies: waiting for the user's OK on a tool call, with the subagent that asked; waiting for a child run; waiting for the user's answer, since when; waiting until a time; else running, since the step started.

## Examples

- Given a run that read, drafted, waited for an answer and was approved,
  when its steps are read,
  then they are read and draft, done with how long each took, then review, answered with `approve` and its time, and not the end state.
- Given a run that failed in its second step,
  when its steps are read,
  then the first is done and the second failed.
- Given a run whose parallel step's branches each entered their own states,
  when its steps are read,
  then the branches' states are not steps of their own.
- Given runs whose last step waits for an approval, a child run, an answer or a timer, or is still running,
  when their steps are read,
  then the last step says so, with what it waits for.
