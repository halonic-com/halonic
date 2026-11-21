# runs.run-view.slow-step-line

- Status: active
- Since: unreleased
- Source: HAL-1845 part 2b; failure-states (HAL-1712) W5 and F3; microcopy 22 F3 (HAL-751, revision 48, approved on HAL-1720); started events `events.started-events`; first-run-progress revision 2 (HAL-7986) 3.3 and section 9, approved on HAL-7993; HAL-13409; provider names R8 (HAL-12411)

When a run is running and its log's last event names a wait, the run page shall show the kit's `WaitingLine` (`kit.waiting-line`) as a banner above the receipt, and once the log has been quiet for 2 seconds, it and the run page's entry for the step the run is in, in place of "Running", shall say what the step waits for, from that event:

- a model call (`llm.request`): "Waiting for *Anthropic*", naming the provider as the failed banners do: the `name` its file gives, else its known name (OpenAI, LM Studio), else its id as written, and no reason; for Ollama "Waiting for Ollama on this computer", or on a phone "Waiting for Ollama on your computer", with the reason "It loads the model first, so the start is slow." in the line from 10 seconds;
- a tool call (`tool.called`): "Waiting for the tool *search_pages*";
- a connector program starting (`connector.started`): "Starting the connector *notes-mcp*";
- a harness program starting (`harness.started`): "Waiting for *Claude Code*";
- a sandbox opening (`sandbox.started`): "Starting the sandbox".

The line shall count the time since that event and show without a new event, so the page draws again when the last event turns 2 seconds old. A new event, or a last event that names no wait, shall bring back "Running" and take the line away. Only the step the run is in has the line; a run that isn't running never has it. Where the page can open Check this computer, the line shall offer **Something wrong?** from 10 seconds; until that dialog lands (HAL-13411) nothing passes it, and the line has no action. Stop run stays in the header.

Limits, for the docs: the line names the provider, not the model's alias or the server's address; it will once the model events carry them (HAL-13404). It is on the run page only, not yet on the run card or the canvas step. The tool line has no connector name, because `tool.called` doesn't carry it, and the connector line has no second sentence about a first download, because the page doesn't know the connector's command.

## Examples

- Given a running step whose last event is a model call to the provider `anthropic` 3 seconds ago, whose file gives no name,
  when the run page is shown,
  then the step's line and the waiting line read "Waiting for Anthropic", with "3 s", and no reason.
- Given the same call to a provider `work` whose file names it "Work GPT",
  then the line reads "Waiting for Work GPT".
- Given the same call 1 second ago,
  when the run page is shown,
  then the step's line reads "Running" and no waiting line shows; both change at 2 seconds without a new event.
- Given a running step whose last event is a model call to Ollama 10 seconds ago,
  when the run page is shown,
  then the waiting line reads "Waiting for Ollama on this computer" and "It loads the model first, so the start is slow.".
- Given the same call on a phone,
  when the run page is shown,
  then the waiting line reads "Waiting for Ollama on your computer".
- Given a running step whose last event is the agent's answer, however long ago,
  then the line reads "Running" and no waiting line shows.
