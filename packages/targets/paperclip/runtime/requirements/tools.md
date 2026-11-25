# paperclip-runtime.tools

- Status: active
- Since: unreleased
- Source: HAL-17949, step 1a of the phase 3 plan on HAL-17450 (rev 5, "Safety": the workspace can rearrange and reword but never grant itself a new power); Liam on HAL-17985 (the action list as data, from its own entry point)

When an agent calls a tool the plugin's manifest declares, the runtime shall run the tool's action handler with the settings of the snapshot it serves, under the tool's short name; it shall answer that the tool is off, and run nothing, when the served snapshot doesn't define the tool, changes its action or parameters from the built-in snapshot, or names an action the runtime has no handler for; it shall refuse a caller the tool's `callers` don't name; it shall read GitHub only with the read token set in its settings, by GET requests to api.github.com; and the runtime shall list every action of the format, with whether it can run it and the Paperclip capabilities it needs, from an entry point without the worker.

## Examples

- Given a snapshot whose `pr_status` runs `github.pull-request` on `acme/website` and a handler for that action,
  when Mateo calls `pr_status`,
  then the handler gets the tool with `acme/website` and Mateo as the caller.
- Given a pinned snapshot that leaves out `my_prs`, or points `pr_status` at `github.merge-queue`, or adds a parameter,
  when an agent calls that tool,
  then it answers that the tool is off and sends no request.
- Given a tool offered only to `priya`,
  when Mateo calls it,
  then it answers that the tool isn't offered to the calling agent.
- Given a runtime with no handler for `paperclip.task`,
  when the builder reads the action list,
  then `paperclip.task` is listed as not available.
- Given a handler that asks GitHub for a path on another host,
  when it runs,
  then the reader refuses to send the token there.
