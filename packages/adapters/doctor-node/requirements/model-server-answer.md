# doctor-node.model-server-answer

- Status: active
- Since: unreleased
- Source: HAL-16336

When the doctor asks a model server on this computer which models it has loaded, it shall ask an OpenAI-compatible server at its `baseUrl` followed by `/models`, without the query or fragment the `baseUrl` may carry, and it shall read at most 1 MiB of any server's answer: a longer answer, or one that declares a longer `content-length`, shall be refused without reading the rest, and the server shall show as not answering.

## Examples

- Given an OpenAI-compatible server at `http://localhost:8000/v1/?drop=all#top`, when the doctor asks it, then it asks `http://localhost:8000/v1/models`.
- Given an Ollama server that answers with 2 MiB, when the doctor asks it, then it throws "localhost:11434 answered /api/ps with more than 1 MiB.".
- Given a server whose answer declares a `content-length` of 2 MiB, when the doctor asks it, then it throws the same without reading the body.
