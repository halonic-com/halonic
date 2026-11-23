# assistant.chat.enter-sends

- Status: active
- Since: unreleased
- Source: HAL-16795 (T14 PR 6a); req-assistant (HAL-110); flow-assistant 5.1 (HAL-647); UX checklist T14 1.3 (HAL-1361)

When the person presses Enter without Shift, or Send, in the Build chat's box, the chat shall send the message, empty the box, show the message, and ask the Assistant host to answer it in that chat; a box with only spaces shall send nothing. While the answer is written, the chat shall build the reply step by step: each text the model writes, and each tool call as one line ("Using *read file*…", then "Used *read file*", or "*Read file* didn't work"), under the hidden heading "The assistant said". The status line shall say "Running · thinking" until a tool runs, then "Running · reading *triage.workflow.yaml*" for a file read, or "Running · using *tool*" for another tool. When the answer ends, the chat shall announce once "Answer finished.", with "*2* items to review." when the chat left items to review, and nothing while it streams in.

## Examples

- Given an empty Build chat, when the person types "Add a routine" and presses Enter,
  then the box is empty, "Add a routine" shows on the right, and the host is asked to answer it.
- Given the box has only spaces, when they press Enter, then nothing is sent.
- Given the model reads `hubs/acme/workflows/triage.workflow.yaml`,
  then the status line says "Running · reading triage.workflow.yaml" and the reply shows "Using read file…".
- Given the answer ends and the chat left 2 items to review,
  then "Answer finished. 2 items to review." is announced once.
