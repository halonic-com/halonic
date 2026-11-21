# workspace.load-leaves-out-working-folders

- Status: active
- Since: unreleased
- Source: HAL-13334 (follow-up to HAL-13291), plan approved by Liam; the port's `leaveOut` (`ports.definition-store-left-out`)

When `loadWorkspace` reads a workspace, the workspace package shall first list and parse the agent files, at the workspace root and in every hub, and then leave out of the source's `list()` and `version()` the working folder of every harness agent among them (one whose `harness` is set and isn't `halonic`, with `files/agents/<id>` when its file names no folder) and every `node_modules` folder, at any depth. It shall neither list nor read a file in a left-out folder, shall not list such a file as ignored, and shall name the left-out working folders, sorted, in the loaded workspace's `leftOut`. Its version then covers only the files it lists, so a change in a left-out folder alone doesn't change it. An agent file that doesn't parse shall leave nothing out. If a working folder is, holds or sits inside a place for definitions (a kind's folder or root file, the hubs, or a name the format protects), then the loader shall throw an `invalid_input` error naming the folder, rather than leave definitions out.

The reason: an agent's working folder and installed packages can hold tens of thousands of files and no definitions, and a folder store read every byte of them on every load. The format refuses such a working folder first (`format.agent-sandbox-fields`); the loader checks again so that a gap in the format can never hide a definition.

## Examples

- Given a Claude Code agent with `workingFolder: repo`, when `repo/src/main.ts` changes, then the loaded workspace's version stays the same, and when `README.md` changes, it changes.
- Given that agent, when the workspace is loaded, then nothing under `repo/` or in a `node_modules` folder is listed or read, `leftOut` is `repo`, and `ignored` holds `README.md` and `repository.md` only.
- Given a Claude Code agent `coder` in the hub `support` with no folder, then `leftOut` is `files/agents/coder` and `files/shared.md` is still ignored.
- Given that agent's file with an error, then `leftOut` is empty and `repo/src/main.ts` is ignored.
- Given an agent in Halonic's own loop, then `leftOut` is empty.
- Given a working folder `agents`, `agents/scratch`, `Workflows`, `hubs/support` or `models.yaml`, then the loader throws "the working folder … overlaps the workspace's definitions."; given `files/scratch`, it leaves that folder out.
