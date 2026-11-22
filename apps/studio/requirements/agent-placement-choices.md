# studio.agent-placement-choices

- Status: active
- Since: unreleased
- Source: HAL-4295, HAL-1709 (checklist 3.8, Julian's conditions from HAL-1673, his review on HAL-13201, Liam's conditions on HAL-13194; the day the file changed, checklist 3.8); `app.agent-placement`

The Studio app shall give the Harness page where each agent runs on this computer, read through `AgentPlacement` from the agent's saved file and keyed by the workspace's path, the agent's hub and its id, as the engine reads it: in its sandbox, on this computer since the time the person chose, or on hold when the choice was made for an earlier version of the file. On hold, it shall also say when the file changed: the time of the newest version that changed it after the choice, and only when the saved file is that version. It shall save On this computer only for the fingerprint the person was shown in the warning, and save nothing when the saved file changed since, answering with the new fingerprint. It shall also say whether the agent's file has unsaved changes. It shall also say whether this Studio can start an agent outside its sandbox, as its harness host reports it, and not by default. It shall put an agent back in its sandbox by forgetting the choice. A choice shall hold on the computer it was made on only. Without an agent host, it shall offer no choice.

## Examples

- Given an agent nobody chose for, then it runs in its sandbox, with its saved file's fingerprint.
- Given a person confirms On this computer with the fingerprint they were shown, then it runs on this computer, since the time they chose.
- Given On this computer was chosen on one computer, when the same workspace is opened on another, then the agent runs in its sandbox there.
- Given On this computer was chosen, when the agent's file is saved with a change, then the choice is on hold; when the person confirms again with the new fingerprint, then it runs on this computer again.
- Given a choice on hold, when the newest version that changed the agent's file was made after the choice and the saved file is that version, then the answer says the file changed at that version's time; when the file was edited since that version, or that version is older than the choice, or the versions can't be read, then it says no time.
- Given the file changed after the warning was shown, when the person confirms, then nothing is saved and the answer holds the new fingerprint.
- Given an agent on this computer, when the person chooses the sandbox, then it runs in its sandbox.
- Given an unsaved change to the agent's file, then the fingerprint is still the saved file's.
- Given an unsaved change to the agent's file, then the answer says the file has unsaved changes; a change to another file, or saving it, doesn't.
- Given no agent host, then there is no placement, and choosing rejects.
- Given a harness host that can't start an agent outside its sandbox, then the answer says Studio can't; given one that can, then it says Studio can.
