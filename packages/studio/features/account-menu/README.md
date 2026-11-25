# @halonicjs/studio-feature-account-menu

The account menu of a served Studio with many users signed in through Halonic Cloud (S2-25, flows
B7): the customer's initials at the title bar's right end open their name, the plan and usage line
(to the account page's plan), **Account** and **Sign out**, which shows "You've signed out of
{Product}" with **Sign in again**.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-account-menu` (the feature) and `@halonicjs/studio-feature-account-menu/api`

The feature only *wants* `AccountMenuHostService`: the served Studio provides it, from
`GET /api/account-menu` and `POST /api/sign-out`; the desktop app doesn't, so it shows no menu.

## Example

```ts
import { accountMenuFeature } from "@halonicjs/studio-feature-account-menu";
import { AccountMenuHostService } from "@halonicjs/studio-feature-account-menu/api";

const shell = createShell({ features: [accountMenuFeature], hostServices: [AccountMenuHostService], host, platform });
services.provide(AccountMenuHostService, new ServedAccountMenu(pageFetch, (address) => location.assign(address)));
```
