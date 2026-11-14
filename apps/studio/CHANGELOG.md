# @halonicjs/app-studio

## 0.1.1

### Patch Changes

- 7c9290b: The agent host checks a workspace connector's trust itself before it starts the program, with or without a sandbox. It reads the trust record in the profile and refuses a connector that record doesn't hold.
- 3cd740c: Install the command line from the source with `pnpm add -g ./apps/cli`; `halonic --version` prints its version. On a Node.js older than 26.12, `halonic` says in one line which version it needs.
- 3cd740c: Under WSL, `halonic doctor` warns when the workspace is on a Windows drive such as `/mnt/c`, and `halonic doctor` and `halonic run` warn when Node.js or pnpm is the Windows one.
- 0aad02c: Settings › Agent sandbox now has the **New agents run** choice: In a sandbox (recommended) or On this computer. Choosing On this computer asks first, and agents you already have keep their setting.
- 3cd740c: `halonic plugin add` adds a plugin from a folder or a git address, `halonic plugin remove` removes one, and `halonic trust --plugin <id>` turns on a plugin that is off.
- 9b02955: The ring in the Studio's title bar and on the Android connect page now has the new blue to cyan gradient, a band of 16% of the diameter, and is drawn the same in both places.
- 3cd740c: A run's log now shows the model calls of its own steps, and the run's usage, cost and `budget.perRun` count them: a run now stops when its steps reach the run budget.
- 3cd740c: `halonic run`, `halonic runs send` and `halonic routines watch` refuse a workspace whose files have errors, before anything starts, and point you to `halonic validate`. `halonic doctor` shows the same problem on its Workspace line.
- cba81ab: A program connector's `inheritEnv` is refused when the program starts in a sandbox, because the sandbox gives it only its own `env` and secrets. A connector can now name the sites it may reach with `sites`, and `halonic trust` lists them.
- 3cd740c: New workspaces from `halonic init` start local only: they use only models and connectors on this computer. To use a cloud model, set `privacy.localOnly: false` in `workspace.yaml`.

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
