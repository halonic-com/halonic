# runtime.paperclip-writes

- Status: active
- Since: unreleased
- Source: HAL-17956 and HAL-18170 (Liam and Julian's review of halonic#5932) (plan document on that task, and Liam's decisions A and B and his five security requirements there); the refusals and limits are those of the task tools in `tooling/paperclip` (HAL-16403)

When an agent calls a tool on `paperclip.comment`, `paperclip.next-step` or `paperclip.finish-run`, the runtime shall check the parameters, the task and the caller exactly as a write would, refusing the same input with the same words as the task tools in `tooling/paperclip`, and refusing a task change on a task the caller doesn't hold; and only when the tool file sets `mode: write` shall it make the writes, otherwise it shall answer the exact writes it would make and call no write client, whatever the agent's parameters say. A task change shall go through `issues.setDisposition` when the host has it, as one write with the comment; on a host without it, through the comment and then the plain issue update, refusing `in_progress`, whose monitor only `setDisposition` can set. An action shall reach only the Paperclip clients its handler declares the capabilities for, and only the writing actions shall declare `issue.comments.create` or `issues.update`; an action shall list agents only when its handler declares `agents.read`, and only those of the calling agent's company. The runtime shall answer that a tool is off, and run nothing, when the served snapshot sets `mode: write` on a tool the built-in snapshot doesn't, so going live needs a new plugin build, while a served snapshot may set a tool built with `mode: write` back to dry run.

## Examples

- Given a `comment` tool with `mode: dry-run`, or with no mode,
  when an agent calls it with `mode: write` in its parameters,
  then it answers "Dry run: would post your comment on …" and the host gets no write.
- Given a `set_next_step` tool with `mode: write` on a host with `setDisposition`,
  when Tomas sets his task to `in_progress` with a 20-minute monitor,
  then the host gets one `setDisposition` with the status, the comment and the monitor.
- Given the same tool on a host without `setDisposition`,
  when Tomas sets his task to `in_progress`,
  then it is refused and nothing is written.
- Given a `finish_run` tool with `mode: write` on a host without `setDisposition`,
  when Tomas hands his task to Liam,
  then the host gets Tomas's comment, then one update to `todo` assigned to Liam, as Tomas's run.
- Given a `set_next_step` tool file whose parameters are plain values,
  when Tomas calls it with `monitorInMinutes: 20` and `monitorRef`, or with `status: blocked` and `blockedBy: "HAL-2, HAL-3"`,
  then it reads them as the `monitor` object and the `blockedBy` list, with the same limits and refusals.
- Given a `finish_run` tool,
  when Tomas finishes a task Liam holds,
  then it is refused, in dry run too.
- Given a read action whose code asks for the comment client,
  when it runs,
  then it fails and the host gets no write.
- Given a plugin built with a `comment` tool in dry run,
  when the pinned snapshot sets that tool to `mode: write`,
  then the tool is off until a new plugin build, and nothing runs.
- Given a plugin built with a `comment` tool in `mode: write`,
  when the pinned snapshot sets it back to `mode: dry-run`,
  then the tool runs in dry run.
