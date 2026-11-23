# cli.commands.serve.model-choice

- Status: active
- Since: unreleased
- Source: HAL-14808 (PR 3; Liam's D2 and D3); `server.model-choice-routes`, `server.model-choice-no-trust`

The `halonic serve` command shall give the server the first run's model choice on this computer, one service per signed-in session, and the write-only key routes over the same secrets file. A tested key shall be saved to this computer's secrets file, the one a run reads; the test call and Ollama's list of models shall go through the client a run's model calls go through. The served model choice shall never grant trust: its trust check answers only whether the served workspace is trusted now, and every grant is refused. The command shall keep a service for at most 20 sessions, forgetting the one used longest ago first.

Rationale: a served window gets the same Pick a model as the desktop, from the one implementation on this computer, so a browser or phone never calls a provider or Ollama itself. Trust over the network is not the same as trust given at the computer, so it stays a step there (D2). Forgetting a session's service only means its test has to run again, and it keeps what the server holds bounded.

## Examples

- Given a session tests an Anthropic key and presses Continue, then the key is saved to this computer's secrets file and the answer says whether the workspace is trusted now.
- Given the choice adds a provider to a trusted workspace, then Continue saves the choice and the answer says the workspace isn't trusted: it has to be trusted again on this computer.
- Given 21 sessions use the model choice, then the first one's test is forgotten.
