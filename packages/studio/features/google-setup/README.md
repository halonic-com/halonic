# @halonicjs/studio-feature-google-setup

The Google setup feature of the Studio. It turns each connected Google account that needs setup,
a new sign-in, a new client secret or an added service into an item in the Inbox
(`@halonicjs/studio-feature-inbox`).

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-google-setup` (the feature) and `@halonicjs/studio-feature-google-setup/api`

The app provides `GoogleSetupAccountsService`: each account with its setup record, its address,
its services and how many routines wait for it. The feature adds its source to the Inbox when a
workspace opens. Step counts and names come from `setupSteps`, so Studio never names a service.

The same service says how the client secret is entered (`secretEntry`: the field, kept on this
computer or on the one that runs Halonic, or no field in the browser demo and for a served Studio
without a password) and sends it to the secret store (`saveClientSecret`, on its own request). The
secret is a kit `SecretText` from the input to that call: it is never part of an edit, the setup
record, an error or a log line. Steps 5 and 6 show the client ID and the secret fields. Step 7 shows what to read before the
sign-in: for a personal account a preview of Google's warning, for a Workspace account the note to
send the admin (`adminNote`, which never holds the secret). The same step has **Sign in with Google**: the service's
`startSignIn` gives the address to open, `cancelSignIn` drops it, and the step says "Waiting for
Google…" until the record shows the sign-in ended or 10 minutes pass. After it, `checkAgain` is
**Check again** under the result lines, `wrongAccount` reads the other address for a sign-in that
came back for another account, and `changeAddress` is "Use that address for this connector instead".

`GoogleConnectorBlock` (from `/api`) is the Google block of the connector page: the account's rows,
**Sign in again** and **Replace secret** (which open the setup item) and **Disconnect Google…**,
which calls the service's `disconnect`. The page that mounts it passes the account and refreshes it
after a change.

## Example

```ts
import { googleSetupFeature } from "@halonicjs/studio-feature-google-setup";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";

// Add `googleSetupFeature` to the app's features, and provide the accounts for each workspace:
studio.services.provide(GoogleSetupAccountsService, () => hostAccounts);
```
