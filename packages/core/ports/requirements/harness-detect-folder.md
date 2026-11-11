# ports.harness-detect-folder

- Status: active
- Since: 0.1.0
- Source: review follow-up on HAL-5216 (an agent's sign-in lives in its own settings folder), approach agreed on HAL-5231

The `Harness` port shall let a caller give `detect()` an agent's settings folder, the one that agent's runs get, so the sign-in answer is about that agent and not about the person's own sign-in. A harness whose program keeps its sign-in in that folder shall ask the program about that folder. Without a folder, `detect()` shall answer as before.

## Examples

- Given Claude Code is signed in in the person's own settings but not in the agent's folder,
  when `detect({ settingsFolder })` answers,
  then the answer is `signed-out`, because that is what the agent's run will find.
- Given no folder,
  when `detect()` answers,
  then the answer is the program check and the person's own sign-in, as `halonic doctor` shows outside an agent.
