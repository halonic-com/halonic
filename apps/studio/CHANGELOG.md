# @halonicjs/app-studio

## 0.1.0

First release of Halonic.

### Command line

- `halonic test` runs the tests of a workspace's workflows with the test model. With `--json`, a workspace without tests reports zero counts instead of failing.
- `halonic runs send` answers a run that is waiting for you. `halonic runs show` now tells you when a run is waiting and how to answer it.
- `halonic run` checks that the sandbox is ready before it starts. If it is not ready, the message says why.
- `halonic run` prints each step's line when the step ends, names the model alias on the live line, and shows retries with `--debug`.
- Ctrl C tells you when it could not cancel the run.
- `halonic trust` lists the trusted workspaces from the real folder.
- `halonic validate` names a workspace file it cannot read.

### Studio app

- Try it: run a workflow from the app straight away.
- Plugins: add, review and manage plugins in the app.
- A saved file now shows that it is live.
