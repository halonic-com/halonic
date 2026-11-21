# runs.run-view.step-failed-call

- Status: active
- Since: unreleased
- Source: HAL-12415 option (a), decided by the team (Chief with Sofia, 18 Nov) under HAL-2282; ux check HAL-12390 C7 and rule E1; microcopy (HAL-751) revision 113, 1.6, E1, E3 and E4; the lines for a logged cause: HAL-12471, the connector-start ones decided by the team on HAL-13829

When a step's tool call has a `tool.result` whose `outcome` is `error` or `unknown`, the step panel (`runs.run-view.step-events`) shall show one quiet line under that call, outside its folded arguments, starting with a ✕ that a screen reader doesn't hear:

- outcome `unknown`: "✕ Didn't work: the tool `create_note` (*notes-mcp*) broke off without an answer, so it may or may not have done its work.", the engine's own words for that outcome;
- outcome `error`: "✕ Didn't work.", because the log gives its reason only as free text.

When the result has a `cause` the events package's reader `toolFailureCauseOf` reads (`events.tool-result-cause`), the line shall say that cause instead, whatever the outcome:

- `time-limit`: "✕ Didn't work: the tool `search_pages` (*notion*) didn't answer within 60 seconds, so it may or may not have done its work.", with the cause's `seconds` ("1 second" for one);
- `engine-stopped`: "✕ Didn't work: Halonic stopped while the tool `create_note` (*notes-mcp*) was running, so it may or may not have done its work.";
- `not-made`: "✕ Didn't work: the call to `create_note` (*notes-mcp*) wasn't made, because" and then, by `why`, "its connector isn't connected." (`not-connected`), "its connector no longer offers it." (`tool-gone`), "sending is turned off." (`sending-off`) or "the model gave it arguments that aren't usable." (`bad-arguments`);
- `connector-not-started`: "✕ Didn't work: the connector *notes* didn't start: its program `acme-notes-mcp` isn't on this computer." (`program-missing`), "✕ Didn't work: the connector *mailbox* didn't start: it needs the secret `mailbox-token`, which isn't set." (`secret-not-set`), or "✕ Didn't work: the connector *mailbox* didn't start." for `other`, `plugin-not-trusted`, `plugin-changed` or a cause without a `name`. Without a connector from the log, "the connector of the tool `create_note`" names it.

The program and the secret are the names the cause holds, in code style; the line never shows a secret's value.

The connector in brackets shall come from the event the engine logs right before the call, `connector.started` or a `tool.unasked` for the same tool; without one the brackets are left out. The line shall never show the result's text, which is the tool's or the engine's own words (E3). A call whose outcome is `ok`, a call from an older log without `outcome`, and a call that has no result yet shall have no line. A `tool.result` finds its call the way the timeline does (`entryOf`), so of two calls to the same tool, only the one that failed has the line.

Limits, for the docs: the connector is named by its id in the workspace, as the log writes it, not by a display name. A call a person approved whose connector then didn't start has no `tool.called`, and a connector that couldn't list its tools when a turn started (`connector.listing-failed`) made no call, so the panel lists neither as a tool call and neither gets this line. Results from harness tools (Claude Code, Codex) carry no cause and keep the `unknown` or `error` line.

## Examples

- Given step Draft's call to `create_note` on the connector notes-mcp broke off without an answer,
  when the person opens Draft's entry,
  then under `create_note` the panel reads "✕ Didn't work: the tool `create_note` (*notes-mcp*) broke off without an answer, so it may or may not have done its work.".
- Given a call to `search_pages` failed with the outcome `error`,
  when the person opens its step,
  then under `search_pages` the panel reads "✕ Didn't work." and nothing of the tool's own error text.
- Given a call to `send_email` that worked,
  when the person opens its step,
  then nothing shows under `send_email`.
- Given a call to `search_pages` on the connector notion ran out of its 60 seconds, so its result has the cause `time-limit` with `seconds: 60`,
  when the person opens its step,
  then under `search_pages` the panel reads "✕ Didn't work: the tool `search_pages` (*notion*) didn't answer within 60 seconds, so it may or may not have done its work.".
- Given a call to `read_note` on the connector notes whose result has the cause `connector-not-started` with `why: "program-missing"` and `name: "acme-notes-mcp"`,
  when the person opens its step,
  then under `read_note` the panel reads "✕ Didn't work: the connector *notes* didn't start: its program `acme-notes-mcp` isn't on this computer.".
- Given a call to `create_note` whose result has a cause with a code the reader doesn't know,
  when the person opens its step,
  then under `create_note` the panel reads the line for its outcome, as without a cause.
