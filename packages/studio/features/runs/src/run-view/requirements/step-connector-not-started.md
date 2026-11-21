# runs.run-view.step-connector-not-started

- Status: active
- Since: unreleased
- Source: HAL-15009, follow-up to HAL-12471; the lines are the `halonic tools review` ones decided by the team on HAL-13829 (`cli.commands.tools.connector-start`), in the quiet ✕ line of `runs.run-view.step-failed-call` (HAL-12415 option a; microcopy 1.6, E1)

When a step's log has a `connector.listing-failed` event (`events.connector-listing-failed`), because a connector couldn't list its tools when one of the step's model turns started and the turn went on without them, the step panel (`runs.run-view.step-events`) shall show one quiet line for that connector at the top of the step's Tool calls, before its first tool call, starting with a ✕ that a screen reader doesn't hear:

- `program-missing`: "✕ Couldn't list the tools from *notes*: its program `acme-notes-mcp` isn't on this computer.";
- `secret-not-set`: "✕ Couldn't list the tools from *mailbox*: it needs the secret `mailbox-token`, which isn't set.";
- `other`, a cause without a `name`, or a cause the events package's reader `toolFailureCauseOf` can't read: "✕ Couldn't list the tools from *notes*.".

The connector is its id in the workspace, in italics; the program and the secret are the names the cause holds, in code style, and the line never shows a secret's value. Every name shall be plain text, with hidden and direction-changing characters escaped (`std.hidden-characters`). A connector shall get one line however many of the step's turns it failed in, in the order it first failed. A connector that the line under one of the step's tool calls already says didn't start (an approved call whose connector didn't start, `runs.run-view.step-failed-call`) shall get no line of its own. Tool calls shall show for such a step even when it made no tool call, and the step shall not read "This step made no model or tool calls.".

## Examples

- Given step Draft's turn started while the connector notes couldn't list its tools because its program `acme-notes-mcp` isn't on this computer,
  when the person opens Draft's entry,
  then under Tool calls the panel reads "✕ Couldn't list the tools from *notes*: its program `acme-notes-mcp` isn't on this computer.".
- Given the connector mailbox couldn't list its tools in two of Draft's turns because its secret `mailbox-token` isn't set,
  when the person opens Draft's entry,
  then the panel reads "✕ Couldn't list the tools from *mailbox*: it needs the secret `mailbox-token`, which isn't set." once.
- Given a person approved Draft's call to `send_mail` and the connector mail then couldn't list its tools,
  when the person opens Draft's entry,
  then the line under `send_mail` says mail didn't start, and no line above the tool calls repeats it.
