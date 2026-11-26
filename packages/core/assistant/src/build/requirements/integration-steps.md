# assistant.build.integration-steps

- Status: active
- Since: unreleased
- Source: HAL-1309 plan rev 1, PR 4, steps 2 to 5 (Liam's OK, 25 Nov); HAL-511 requirements 1 and 7; HAL-524; HAL-18269; HAL-19168 (check every reply with `checkReply`)

The built-in authoring instructions shall tell the model how to build an integration: check the built-in integrations and the workspace's own integrations and connectors first, and offer one that fits; ask only for the service's address, which tools to offer (read-only by default) and how it signs in; for a service that signs in only with OAuth, say so plainly and stop; read the guide with `integration_guide`, which is there only once the workspace is trusted; check every reply from the service with the kit's `checkReply` and a non-strict `z.object(...)` schema; and when `validate` still fails after two fixes, stop and say what's wrong. They shall never ask for a key, token or password in the chat. A workspace's own `halonic-authoring` skill replaces all of this (`assistant.build.authoring-skill-override`).

## Examples

- Given a workspace with no `halonic-authoring` skill,
  then the model is told to offer a built-in integration that fits before it builds one, and to read the guide with `integration_guide`.
- Given the person asks for an integration with a service that signs in only with OAuth,
  then the instructions tell the model to say it can't build that sign-in here, and stop.
- Given the model writes an integration's client code,
  then the instructions tell it to check every reply with the kit's `checkReply`.
- Given `validate` fails after the model's second fix,
  then the instructions tell the model to stop and say what's wrong.
- Given an untrusted workspace,
  then the instructions say the integration can be built once the workspace is trusted, since `integration_guide` isn't offered before then.
