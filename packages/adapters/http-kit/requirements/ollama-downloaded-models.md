# http-kit.ollama-downloaded-models

- Status: active
- Since: unreleased
- Source: HAL-13430; first-run-flow revision 7, section 3.3 (the model screen's states) and 8d, approved by the board on HAL-7993

When the model detection asks which models are downloaded, the Ollama source shall send one `GET http://localhost:11434/api/tags` without a key, refusing redirects, and shall give the names from its answer. If no full answer comes within 3 seconds, the answer has an error status, or it isn't Ollama's list, then the source shall throw.

## Examples

- Given Ollama answers `/api/tags` with `llama3.2:latest`,
  then the source gives `llama3.2`.
- Given Ollama answers with HTTP 500,
  then the source throws and names the status.
- Given Ollama sends the headers but never ends the body,
  then the source throws after 3 seconds.
