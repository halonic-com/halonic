# google-setup.check-result

- Status: active
- Since: 0.1.0
- Source: HAL-708 (build plan B3; design 3.5 point 3, section 6 item 7; HAL-1226)

When a service's check answers with a 2xx status, `readGoogleCheckAnswer` shall return `works`. When it answers with any other status that doesn't mean the API is switched off, it shall return `checkFailed` with the status and Google's reason code, taken from the first `ErrorInfo` detail whose reason is a code on the known list, or else the first such `errors` entry; any other reason is skipped. It shall never keep a `message` or any other free text from Google's answer.

## Examples

- Given status 200 or 204, then the result is `works`.
- Given status 429 with the reason `rateLimitExceeded`, then the result is `checkFailed` with 429 and that reason.
- Given status 502 and an HTML page, then the result is `checkFailed` with 502 and no reason.
- Given a reason that holds a sentence, or a single word that isn't on the known list, then the result has no reason.
