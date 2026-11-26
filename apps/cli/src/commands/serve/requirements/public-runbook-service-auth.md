# cli.commands.serve.public-runbook-service-auth

- Status: active
- Since: unreleased
- Source: HAL-19473 (the S9 security review of the public name, its [major] on the Service Auth rule); HAL-19474; `cli.commands.serve.public-runbook`

The Access step of the public part of the server engine runbook (`docs/guides/server-engine-public.md`) shall have its Service Auth policy admit only the engine desktops' service tokens, by the **Service Token Tag** selector or the **Service Token** selector, and shall say never to use **Any Access Service Token**.

Rationale: **Any Access Service Token** admits every service token in the Cloudflare account, now and later, so any token made for another purpose would get past Access to the pairing and sign-in routes.

## Examples

- Given the runbook's Access step, then it names the Service Token Tag and the Service Token selectors and says "Never **Any Access Service Token**".
- Given a runbook edit that lets the Service Auth policy admit Any Access Service Token, then the test fails.
