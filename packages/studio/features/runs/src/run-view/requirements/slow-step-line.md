# runs.run-view.slow-step-line

- Status: active
- Since: 0.1.0
- Source: HAL-1845 part 2b; failure-states (HAL-1712) W5 and F3; microcopy 22 F3 (HAL-751, revision 48, approved on HAL-1720); started events `events.started-events`

When a run is running and its log has been quiet for 10 seconds, the run page's entry for the step the run is in shall say what the step waits for, in place of "Running", from the log's last event:

- a model call (`llm.request`): "Waiting for *Claude* to answer.", with the provider's id with a capital; for Ollama "Waiting for Ollama. The first answer can take a minute while it loads the model.";
- a tool call (`tool.called`): "Waiting for the tool *search_pages*.";
- a connector program starting (`connector.started`): "Starting the connector *notes-mcp*.";
- a harness program starting (`harness.started`): "Waiting for *Claude Code*.";
- a sandbox opening (`sandbox.started`): "Starting the sandbox.".

The line shall show without a new event, so the page draws again when the last event turns 10 seconds old. A new event, or a last event that names no wait, shall bring back "Running". Only the step the run is in has the line; a run that isn't running never has it, and it has no action (Cancel comes later).

Limits, for the docs: the line is on the run page's Every step only, not yet on the run card or the canvas step. The tool line has no connector name, because `tool.called` doesn't carry it, and the connector line has no second sentence about a first download, because the page doesn't know the connector's command. The Ollama line has no phone variant yet: on a phone it reads the same, though Ollama runs on the computer.

## Examples

- Given a running step whose last event is a model call to the provider `claude` 12 seconds ago,
  when the run page is shown,
  then the step's line reads "Waiting for Claude to answer.".
- Given the same call 4 seconds ago,
  when the run page is shown,
  then the line reads "Running", and it changes to the waiting line at 10 seconds without a new event.
- Given a running step whose last event is the agent's answer, however long ago,
  then the line reads "Running".
