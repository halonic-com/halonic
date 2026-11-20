# workspace.ignored-settings

- Status: active
- Since: unreleased
- Source: HAL-14302, from the C340 check on HAL-14271 (rows 6 and 9, code rows C26 and C28): settings Halonic ignores passed `halonic validate` silently

When `loadWorkspace` checks a workspace, the workspace package shall warn about two settings Halonic ignores. First, `defaults.runtime` in `workspace.yaml` or in a `hub.yaml` that names a runtime other than `inprocess`, with code `unknown-runtime` at that key, saying that Halonic runs it in-process and to remove the setting or set it to `inprocess`. Second, an agent's or a method's `instructions` whose whole text is one line that names a file of the workspace, next to the agent's file or from the workspace root, with code `instructions-file-name` at that key, saying that the instructions are that text and to paste the instructions there. These are warnings, so `halonic validate` passes with them and a workspace that runs today still runs.

## Examples

- Given `defaults: { runtime: docker }` in `workspace.yaml` and in a hub's `hub.yaml`, when the workspace is loaded, then each file has the warning `Runtime "docker" isn't one Halonic has; it runs inprocess. Remove defaults.runtime, or set it to inprocess.` at `defaults.runtime`.
- Given `defaults: { runtime: inprocess }`, or no runtime, when the workspace is loaded, then there is no `unknown-runtime` warning.
- Given an agent with `instructions: ./announcer.md` and a file `announcer.md` next to it, when the workspace is loaded, then the agent has the warning `instructions is the text "./announcer.md". Paste the instructions here; Halonic doesn't read files from instructions.` at `instructions`.
- Given a method whose instructions are `prompts/extract.md` and a file of that path at the workspace root, when the workspace is loaded, then the method's `instructions` has the same warning.
- Given instructions that name a file the workspace doesn't have, or that are more than one line, when the workspace is loaded, then there is no `instructions-file-name` warning.
