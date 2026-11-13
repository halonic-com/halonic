# routines.webhook-facts

- Status: active
- Since: 0.1.0
- Source: HAL-195 (plan D22, webhook triggers for routines)

The routines package shall let a verified webhook request reach its routine as `{{trigger.body}}` and `{{trigger.headers.<name>}}`. The body is the parsed value when the request says it is JSON (`content-type` of `application/json` or ending in `+json`) and it parses, and the body text otherwise. Only the headers the routine lists in `trigger.webhook.headers` get through, by lowercase name; every other header, `authorization` and `cookie` included, never reaches the run. What the request holds is data: a placeholder inside the body or a header value is not filled in again, so a sender can't write a template that reads another value.

## Examples

- Given a JSON body `{"n":1}` with `content-type: application/json; charset=utf-8`, when the facts are made, then `body` is `{ n: 1 }`.
- Given a body that isn't valid JSON but says it is, when the facts are made, then `body` is the text.
- Given a body with no `content-type`, when the facts are made, then `body` is the text, even if it looks like JSON.
- Given a routine that lists `x-event` and a request with `x-event` and `authorization`, when the facts are made, then `headers` is `{ "x-event": "<value>" }` only.
- Given a routine that lists `constructor`, when the request has no such header, then `headers` is empty.
- Given a body of `{{trigger.headers.x-event}}`, when the routine's prompt is `{{trigger.body}}`, then the prompt holds that text unchanged.
- Given a routine that isn't triggered by a webhook, when the facts are made, then `headers` is empty.
