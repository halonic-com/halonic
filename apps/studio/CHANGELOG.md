# @halonicjs/app-studio

## 0.1.0

First release of Halonic. From the command line you can validate a workspace, run its workflows, test them with the test model, and answer a run that is waiting for you.

### Command line

- `halonic test` runs the tests of a workspace's workflows with the test model. With `--json`, a workspace without tests reports zero counts instead of failing.
- `halonic runs send` answers a run that is waiting for you. `halonic runs show` now tells you when a run is waiting and how to answer it.
- `halonic run` checks that the sandbox is ready before it starts. If it is not ready, the message says why.
- `halonic run` prints each step's line when the step ends, names the model alias on the live line, and shows retries with `--debug`.
- Ctrl C tells you when it could not cancel the run.
- `halonic trust` lists the workspaces you trusted, also on Windows.
- `halonic validate` names a workspace file it cannot read.
