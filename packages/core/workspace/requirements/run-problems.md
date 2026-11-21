# workspace.run-problems

- Status: active
- Since: unreleased
- Source: HAL-15127 (Liam's decision, option 3 with his additions), from C544-3 (found by Iris on HAL-15101); HAL-6613 for why a file with an error stops a run; subagents: Liam's review of HAL-15119

The workspace package shall give, for a loaded workspace, every problem `halonic validate` lists and one hub's workflow W, the errors that stop a run of W, in their order; warnings never do. An error shall stop it when it is in W's own file, in the file of an agent or a workflow W uses (the agents its steps name, as a task, a for-each or a parallel branch, and the workflows its steps call, followed all the way down, and their subagents, followed all the way down), in any other file that isn't a workflow, agent or test file, or in no file. An error in another workflow's file, in an agent W doesn't use, in another hub's workflow or agent, or in a test file shall not stop it. A file's kind, hub and id shall come from its path, as a broken file often doesn't load; a path no kind places shall stop it. The problem that a hub's agents without a model call a default alias the hub doesn't have shall stop W when an agent or a subagent W uses names no model and runs in Halonic itself, or didn't load. When W didn't load, every error shall stop it.

## Examples

- Given `weekly-report` naming an unknown agent, then a run of `support-reply` in another hub, or in the same hub, is stopped by nothing.
- Given an error in `support-reply`'s own file, in its agent `writer`'s file, or in a workflow it calls, then it stops `support-reply`.
- Given an error in `workspace.yaml`, a hub file, a provider or `models.yaml`, then it stops every workflow.
- Given `writer` handing tasks to the subagent `checker`, then an error in `checker`'s file, or a `checker` file that doesn't load, stops `support-reply`; an error in an agent that is nobody's subagent and no step names doesn't.
- Given an error in an agent `support-reply` doesn't use, or in its test file, then it doesn't stop it.
- Given the default alias problem reported on another agent of the hub, then it stops `support-reply` when `writer` names no model, and not when `writer` names one or runs in a harness program.
- Given a broken file that no kind places, then it stops every workflow; given a workflow whose file didn't load, then every error stops it.
