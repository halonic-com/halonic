# @halonicjs/google-setup

The rules of the Google setup flow in Studio's Inbox, as pure logic over the ports. For now: the
client secret store with staged replace, its token names, the `GOCSPX-` detector and the step
generator. The progress record, the checks after sign-in and the error classification follow.

- **Layer:** core
- **Owner:** priya
- **Public API:** `@halonicjs/google-setup`

## Example

```ts
import { clientSecretStore, looksLikeGoogleClientSecret } from "@halonicjs/google-setup";

const secrets = clientSecretStore(tokens, ids);
const clientRef = await secrets.saveClientSecret(pasted); // only the ref comes back

// Replacing a rotated secret after the first sign-in:
await secrets.stageClientSecret(clientRef, pastedAgain);
// ...refresh a token with secrets.readStagedClientSecret(clientRef)...
await secrets.promote(clientRef); // Google accepted it
await secrets.discard(clientRef); // or: Google refused it, the old one stays

looksLikeGoogleClientSecret(noteText); // hold a note that holds a secret
```

## Setup steps

`setupSteps(input)` turns the route, the account type and the ticked services' sheet fields
(`googleApis`, `googleScopes`, `googleCheck`) into the steps of design 3.2. It returns ids, values
and links; Studio owns the sentences. Nothing in it names a service: everything service-specific
comes from the sheets.

| Id            | Step                 | Carries                                                         |
| ------------- | -------------------- | --------------------------------------------------------------- |
| `project`     | Google Cloud project | New project link, `halonic`, Workspace: inside the organisation |
| `apis`        | Switch on the APIs   | one row per API with its Enable link; Switch on all for 2+      |
| `consent`     | Consent screen       | app name and e-mails; personal: External and `in-production`    |
| `scopes`      | Scopes (D4 switch)   | one row per scope with each service's reason, Copy all scopes   |
| `client`      | Create the client    | `Halonic desktop`; done when step 6 saves a client ID           |
| `credentials` | Client ID and secret | Clients link, for a lost secret                                 |
| `sign-in`     | Sign in with Google  | scopes to grant, one check per service, admin note or warning   |

Progress keys ticks by id, so `listScopes: false` renumbers the steps without moving any tick.
Links open in the project only when its ID is valid; otherwise `projectIdIgnored` is true.

## Token names

The secrets live in the `TokenStore` (encrypted, written by the server), not in `Secrets`, which is
read-only. Names follow the `Secrets` name rule, so they hold refs from the `IdGenerator`, never an
e-mail address or a client ID.

| Token                              | Holds                                       |
| ---------------------------------- | ------------------------------------------- |
| `google-client-<clientRef>`        | the client secret in use                    |
| `google-client-<clientRef>-staged` | a new client secret until Google accepts it |
| `google-account-<accountRef>`      | one Google account's refresh token          |

The refresh token's name is set by plan D2. It can't clash with an integration's own tokens, which
the host stores as `i<n>_<integration>_<token>`. A ref that breaks the rule throws a `RangeError`
with a fixed message: the message never repeats the ref, because with swapped arguments it could
be a secret.

## Rules

- No call returns a secret except `readClientSecret` and `readStagedClientSecret`, and no error
  message holds one.
- **Only the host reads a client secret back.** `readClientSecret` and `readStagedClientSecret` are
  called only by the host's Google sign-in (build plan A2) and its token refresh and secret check
  (B4, B5). Studio, the kit, hubs and integrations never call them: an integration only ever gets
  an access token, through scoped tokens that can't reach `google-client-*`.
- Which accounts share a client ref is in the setup records, so `removeClientSecret` takes
  `usedByOthers` from the caller.
- Before the first sign-in there is nothing to test a new secret with, so the caller uses
  `replaceClientSecret` instead of staging.
