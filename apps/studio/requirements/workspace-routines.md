# studio.workspace-routines

- Status: active
- Since: unreleased
- Source: HAL-1306 (T12 PR 2), HAL-4291; flow-routines 2.1 and 3; states K2 (files are changed through the workspace's files, never the engine); HAL-13498; HAL-13504; HAL-14848

When the desktop app opens a folder, it shall give the Routines feature the folder's routines, those in a hub and those at the workspace's root, each with what starts it in words, the name of what it starts, the time it next starts on its own, and the number of its real runs that wait, read from the workspace's files with their unsaved changes. It shall write every change a person makes, a rename, On or Off, the trigger, the target and the rules, as an edit of the routine's file that keeps its comments, and delete and create a routine as one undoable change of the workspace's files, without the engine. A new routine is a manual one that starts the hub's first workflow, or with none its first agent with the prompt the person typed, with an id taken from its name (`-2` when the hub has it); a hub that has neither refuses it, and so does an agent with no prompt, since a stand-in would be saved as the agent's real task. It shall give a Triggers section the routines in the owner's hub that start it, and its Add trigger a new manual routine named after the owner that starts it, a workflow with the input `{}` or an agent with the prompt the person typed, refused like any new routine when that prompt is empty. It shall list the next times of an enabled routine from its saved trigger, its newest runs, and the skipped times the scheduler recorded. It shall give the routine's Run now, when the app has an engine, the routine's target with its `{{trigger.*}}` placeholders filled in (`{{trigger.lastRun}}` null), started by the engine as a manual run of the routine. For one routine it shall also say whether what it starts runs an agent in Claude Code or Codex (an agent of the workflow and the workflows it starts), so Run now knows it needs the sandbox; an agent on its own starts no program while Halonic can't run one on its own. It shall tell its listeners when a file changed or a run started, moved on or ended.

## Examples

- Given Acme's hub with the routine `weekly-report` that starts the agent `analyst` on Mondays at 09:00, then the list holds it with the summary "Mondays at 09:00 → Analyst" and its next time.
- Given the routine is off, then it has no next time and `nextTimes` is empty.
- Given a rename, then the file's other lines and comments stay as they were.
- Given the hub `acme` has the workflow `reply`, then a new routine "Morning check" is `hubs/acme/workflows/routines/morning-check.routine.yaml`, manual, and runs `reply` with the input `{}`.
- Given a hub with an agent and no workflow, then the new routine runs the agent with the prompt "Sum up the inbox" it was made with; made without a prompt, it is refused with "Say what Analyst should do." and nothing is written.
- Given a hub with neither, then creating a routine fails and writes nothing.
- Given Add trigger on the workflow `reply`, then the routine `reply` starts it with the input `{}`; on the agent `analyst` with the prompt "Sum up the inbox", the routine `analyst` starts it with that prompt; made without a prompt, it is refused with "Say what Analyst should do." and nothing is written.
- Given a routine whose schedule doesn't parse, then it is listed without a next time and its problems say why.
- Given a file changes, or a run starts, then a subscriber hears it, and not after it stopped.
- Given `weekly-report` starts the agent `analyst` in Halonic's own loop, then it starts no program, and with `harness: codex` it starts none either; a routine that starts a workflow with an agent in Claude Code does.
