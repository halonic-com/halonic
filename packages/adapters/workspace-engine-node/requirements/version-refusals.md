# workspace-engine-node.version-refusals

- Status: active
- Since: unreleased
- Source: HAL-17054; Liam's decision on HAL-17049: the workspace engine's watch of versions moves out of the CLI, and its callers word its refusals

When the workspace engine's watched versions can't read a version a run asks for, or a version may not run, they shall refuse with a `VersionRefusedError` that names the reason and the data a sentence about it needs (the commit, the hub and the agent or skill, the run, or whether the saved workspace.yaml turned local only on), and the history's own error as its cause. The refusal shall carry no sentence for a person: each caller says it in its own words. They shall only read a version's trust grant, never make one.

Rationale: the CLI and the Studio's background engine read the same versions, and each speaks to its people in its own words.

## Examples

- Given a workspace whose history can't be opened,
  when the watch opens,
  then it refuses with `history-unavailable`, and the history's error as its cause.
- Given a run that names no version and that the watch didn't start,
  when its agent's file is asked for,
  then it refuses with `no-version-for-agent-file` and the run's id.
- Given a version without the skill an agent selected,
  when the skill's text is asked for,
  then it refuses with `no-skill`, the hub and the skill.
