# @halonicjs/google-setup

The rules of the Google setup flow in Studio's Inbox, as pure logic over the ports. For now: the
token names of the client secret and the refresh token, and the `GOCSPX-` detector. The client
secret store, the progress record, the step generator, the checks after sign-in and the error
classification follow.

- **Layer:** core
- **Owner:** priya
- **Public API:** `@halonicjs/google-setup`

## Example

```ts
import { clientSecretName, looksLikeGoogleClientSecret } from "@halonicjs/google-setup";

clientSecretName("gclient_1"); // "google-client-gclient_1"
looksLikeGoogleClientSecret(noteText); // hold a note that holds a secret
```

## Token names

The secrets live in the `TokenStore` (encrypted, written by the server), not in `Secrets`, which is
read-only. Names follow the `Secrets` name rule, so they hold refs from the `IdGenerator`, never an
e-mail address or a client ID.

| Token                              | Holds                                       |
| ---------------------------------- | ------------------------------------------- |
| `google-client-<clientRef>`        | the client secret in use                    |
| `google-client-<clientRef>-staged` | a new client secret until Google accepts it |
| `google-refresh-<accountRef>`      | one Google account's refresh token          |

`google-account` in the Gmail and Drive sheets names the access token the host hands to an
integration. It isn't a stored token, so the refresh token gets a name per account.
