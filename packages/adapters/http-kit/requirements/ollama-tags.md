# http-kit.ollama-tags

- Status: active
- Since: unreleased
- Source: HAL-13430; first-run-flow revision 7, section 3.3 (the model screen's states) and 8d, approved by the board on HAL-7993

When the model detection asks which models are downloaded, http-kit shall send one `GET http://localhost:11434/api/tags` without a key, refusing redirects, and shall give Ollama's answer as parsed JSON. If no full answer comes within 3 seconds, the answer has an error status, or it isn't JSON, then it shall throw.

## Examples

- Given Ollama answers `/api/tags` with its list,
  then http-kit gives that list as it came.
- Given Ollama answers with HTTP 500,
  then http-kit throws and names the status.
- Given Ollama sends the headers but never ends the body,
  then http-kit throws after 3 seconds.
