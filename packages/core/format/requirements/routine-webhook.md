# format.routine-webhook

- Status: active
- Since: 0.1.0
- Source: HAL-195 (plan D22, webhook triggers for routines)

When `parseFile` reads a routine file, the format shall accept a `webhook` trigger: the `secret`, the name of the secret that signs the request body, and `headers`, the request headers the run may read, which default to none. Each header is a lowercase HTTP header name (letters, digits and `-`, as Node gives them), listed once, and never one that carries the sender's credentials (`authorization`, `proxy-authorization`, `cookie`, `set-cookie`) or that the host's server uses to verify the request; the format exports that list as `WEBHOOK_REFUSED_HEADERS` for the host to import. The file never holds a secret's value, so the format shall refuse a `secret` that is not a valid secret name, or that looks like a key pasted in, with a message that doesn't repeat the value. The trigger is additive: every routine file that parsed before still parses the same. The address a webhook answers on is the host's to give, so the file has no path.

## Examples

- Given `trigger: { webhook: { secret: acme-hook } }`, when it is parsed, then `headers` is `[]`.
- Given `trigger: { webhook: { secret: acme-hook, headers: [x-event] } }`, when it is parsed, then both are kept.
- Given `trigger: { webhook: { secret: "acme hook!" } }`, when it is parsed, then it fails with `secret-name` at `trigger.webhook.secret`.
- Given a `webhook` with no `secret`, when it is parsed, then it fails.
- Given `trigger: { webhook: { secret: acme-hook, path: /x } }`, when it is parsed, then it fails: the file has no path.
- Given `headers: [X-Event]`, `["x event"]`, `[a.b]` or `["{{x}}"]`, when it is parsed, then it fails at that header.
- Given `headers: [x-event, x-event]`, when it is parsed, then it fails with `webhook-header-duplicate` at `trigger.webhook.headers.1`.
- Given `headers: [authorization]`, `[cookie]` or `[x-halonic-signature]`, when it is parsed, then it fails with `webhook-header-refused` at `trigger.webhook.headers.0`.
