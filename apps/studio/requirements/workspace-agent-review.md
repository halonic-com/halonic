# studio.workspace-agent-review

- Status: active
- Since: unreleased
- Source: HAL-17120 (T14 PR 14a-2); AI changes 1.2 (changes to review on an item page), review panel notes 1 and 4; HAL-1307 plan, T14

When the Agents feature asks the desktop app for the assistant's changes to review in an agent's file, the app shall read them from the workspace's review service and give one change per field and per agent step, as `describeAgentChange` names them from the file with every open change rejected to the saved file, each with its id, its sentence, whether it is Important, the parts of the file it covers and the value its first part held before the change. A file the assistant created or deleted, a file whose only changes are comments or spacing, and a file that doesn't read as an agent before or after shall come as one change, "New", "Deleted" or "Changed", decided as a whole. An agent without changes to review shall have none. Accept and Reject of one change shall decide only that change's parts, passing back the reading it came from, so a change read before the file changed decides nothing and answers `stale`; Accept all and Reject all, and any decision on a file decided as a whole, shall decide the whole file. A file that changed outside Halonic since Halonic last saw it shall answer `held` and decide nothing. A decision that was done shall offer an undo that puts it back as it was. The app shall tell the feature each time the review service reports a change to the agent's file, and not for other files.

## Examples

- Given the assistant changed the agent `writer`'s name and model,
  when the feature reads its changes,
  then it gets two changes, "Name" and "Model", the model with the value `fast` from before.
- Given those two changes,
  when the person rejects the model change,
  then the file has the model `fast` again and only the name change is left to review.
- Given those two changes and a file changed by the assistant again since they were read,
  when the person accepts the model change from the old reading,
  then nothing is decided and the answer is `stale`.
- Given the assistant created the agent,
  when the feature reads its changes and the person rejects the one change "New",
  then the file is gone.
- Given the person accepted all of an agent's changes,
  when they undo,
  then the changes are to review again.
- Given a review of the agent `writer` is open,
  when the assistant changes another agent,
  then the feature isn't told.
