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

## Example

```ts
import { googleSetupFeature } from "@halonicjs/studio-feature-google-setup";
import { GoogleSetupAccountsService } from "@halonicjs/studio-feature-google-setup/api";

// Add `googleSetupFeature` to the app's features, and provide the accounts for each workspace:
studio.services.provide(GoogleSetupAccountsService, () => hostAccounts);
```
