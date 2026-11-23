# server.model-choice-routes

- Status: active
- Since: unreleased
- Source: HAL-16635 (HAL-14808 PR 2, Liam's D1–D4); first-run-flow 3.3

When the host passes a `modelChoice` port, the server shall answer these routes behind the sign-in, each on the service `modelChoice.forSession(<session>)` gives for the signed-in session (the SHA-256 of its session token, or `this-computer` on a server with no password), and never on state of its own:

- `POST /api/model-choice/test` with `{"choice": …, "key"?: "<text>"}`: the service's test outcome (`server.model-choice-test`).
- `GET /api/model-choice/key-saved/<provider>`: `{"saved": <boolean>}`, for `anthropic`, `openai` or `gemini`; any other provider answers 404 `not_found`.
- `POST /api/model-choice/line-facts` with `{"choice": …}`: `{"line": <facts>}`, or `{"line": null}` when a file stops the choice.
- `GET /api/model-choice/preview/<testId>`: `{"preview": <facts>}` for a passed test of this session, or `{"preview": null}`.
- `GET /api/model-choice/local-models`: which models Ollama on the computer has, as `one`, `several`, `none-downloaded` or `not-found`, with no cause.
- `POST /api/model-choice/continue` with `{"testId": "<id>"}`: what Continue did (`server.model-choice-no-trust`).

A choice is `{"kind": "key", "provider": "anthropic" | "openai" | "gemini"}` or `{"kind": "local", "model": "<name>"}`, where the name starts with a letter or digit, then has only letters, digits and `._:/-`, at most 200 characters. The server shall check a request in this order and answer the first refusal with a fixed error: not signed in (401 `not_signed_in`); no `modelChoice` port (404 `model_choice_not_supported`); any other method or address (404 `not_found`); a `Sec-Fetch-Site` other than `same-origin` (403 `from_other_site`; no header passes); on `POST`, a content type other than `application/json` (415 `unsupported_media_type`); a body that isn't one of the shapes above (400 `bad_request`). Every answer, refusals included, shall carry `Cache-Control: no-store`. When the service throws, the cause shall go to the error log and the caller shall get 500 `internal_error`.

Rationale: the model choice runs on the computer, where the keychain and Ollama are, and the browser is a thin client. A passed test holds a key until Continue, so it belongs to one session, and a server keeps nothing in module memory.

## Examples

- Given two signed-in sessions, when one tests a choice, then only that session's service is asked.
- Given `GET /api/model-choice/key-saved/acme`, then the answer is 404 `not_found`.
- Given a `POST` to `line-facts` from another site that also isn't JSON, then the answer is 403 `from_other_site`.
- Given a server with no `modelChoice` port, then every model choice route answers 404 `model_choice_not_supported` to a signed-in caller.
