# studio.served-model-choice

- Status: active
- Since: unreleased
- Source: HAL-16637 (HAL-14808 PR 4b; Liam's D2); server.model-choice-routes

The served Studio shall give the first run's model choice through the computer's `/api/model-choice/` routes, on the page's own address and session: the test, whether a key is saved, the trust line before and after a test, Ollama's models, the current model and Continue. A pasted key shall be sent only in the body of the test it is for, and never for a local choice. Continue shall send only the test id, so a served Continue never asks for trust, and a preview shall carry no fingerprint. A refused Continue shall keep the files the computer named. Any refusal or error status shall reject with the method, the path and the status only.

Rationale: the computer has the keychain, Ollama and the workspace's files; the browser is a thin client that never holds a key after the request that sends it, and trust stays a step at the computer.

## Examples

- Given a key choice for Anthropic with a pasted key, then `POST /api/model-choice/test` gets `{"choice": …, "key": "<the key>"}`; without a key it gets `{"choice": …}` alone.
- Given the computer answers 429 to a test, then the test rejects with "The computer answered 429 to POST /api/model-choice/test."
